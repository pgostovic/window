import React, {
  cloneElement,
  createRef,
  CSSProperties,
  FC,
  forwardRef,
  MutableRefObject,
  ReactElement,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const DEFAULT_SCROLL_SPEED = 1;
const DEFAULT_ITEM_SIZE = 40;

type ItemSize = number | ((index: number) => number);

interface Props {
  ref?: MutableRefObject<ScrollerRef>;
  items: unknown[];
  itemSize?: ItemSize;
  scrollTo?: { index: number; position?: number };
  scrollSpeed?: number;
  eventSource?: HTMLElement | (Window & typeof globalThis);
  eventSourceRef?: RefObject<HTMLElement>;
  renderBatchSize?: number;
  onRenderItems?(info: { items: unknown[]; startIndex: number }): void;
  style?: CSSProperties;
  className?: string;
  children(item: unknown, index: number): ReactNode;
}

export interface ScrollerRef {
  scrollToItem(item: unknown, position?: number): void;
  scrollToIndex(index: number, position?: number): void;
}

interface TouchInfo {
  t: number;
  y: number;
  dy: number;
  pid?: NodeJS.Timeout;
}

export const Scroller: FC<Props> = forwardRef(
  (
    {
      items,
      itemSize = DEFAULT_ITEM_SIZE,
      scrollTo = { index: 0, position: 0 },
      scrollSpeed = DEFAULT_SCROLL_SPEED,
      eventSource,
      eventSourceRef,
      renderBatchSize = 5,
      onRenderItems,
      style,
      className,
      children,
    },
    r,
  ) => {
    const ref = r;
    const rootElmntRef = createRef<HTMLDivElement>();
    const itemsElmntRef = createRef<HTMLDivElement>();
    const renderWindowRef = useRef({ from: 0, to: 0 });
    const offsetRef = useRef(0);
    const rafPidRef = useRef(0);
    const [, setRenderFlag] = useState(false); // this is to trigger a render

    const touchInfoRef = useRef<TouchInfo>({ t: 0, y: 0, dy: 0 });
    const heightRef = useRef(0);

    const itemSizes = useMemo(() => calculateSizes(itemSize, items.length), [items, itemSize]);
    const itemOffsets = useMemo(() => calculateOffsets(itemSizes), [itemSizes]);

    const setOffset = useCallback(
      (itemsElmnt: HTMLDivElement | null, offset: number) => {
        offsetRef.current = offset;
        if (itemsElmnt) {
          const height = heightRef.current;
          const renderWindow = renderWindowRef.current;
          let { from, to } = renderWindow;

          let visibleFrom = itemOffsets.findIndex(itemOffset => itemOffset >= offset);
          while (itemOffsets[visibleFrom] > offset) {
            visibleFrom -= 1;
          }
          let visibleTo = itemOffsets.findIndex(itemOffset => itemOffset >= offset + height);
          if (visibleTo === -1) {
            visibleTo = items.length;
          }

          if (visibleFrom < from) {
            from = visibleFrom - renderBatchSize;
            to = visibleTo;
          }

          if (visibleTo > to) {
            to = visibleTo + renderBatchSize;
            from = visibleFrom;
          }

          from = Math.max(from, 0);
          to = Math.min(to, itemOffsets.length);

          if (rafPidRef.current !== 0) {
            cancelAnimationFrame(rafPidRef.current);
          }
          rafPidRef.current = requestAnimationFrame(() => {
            rafPidRef.current = 0;

            // set items container translate transform
            const translateY = -offset + (itemOffsets[from] || 0);
            if (translateY > 0) {
              console.log('Problem', translateY, visibleFrom, visibleTo);
            }
            itemsElmnt.style.transform = `translateY(${translateY}px)`;

            // render items if needed
            if (from !== renderWindow.from || to !== renderWindow.to) {
              renderWindowRef.current = { from, to };
              setRenderFlag(rf => !rf);
            }
          });
        }
      },
      [itemOffsets],
    );

    const lastIndex = items.length - 1;
    const totalSize = lastIndex === -1 ? 0 : itemOffsets[lastIndex] + itemSizes[lastIndex];
    const maxOffset = totalSize - heightRef.current;

    if (ref) {
      (ref as MutableRefObject<ScrollerRef>).current = {
        scrollToItem(item: undefined, position = 0) {
          this.scrollToIndex(items.indexOf(item), position);
        },
        scrollToIndex(index: number, position = 0) {
          const height = heightRef.current;
          const itemSize = itemSizes[index] || 0;
          const itemOffset = Math.min(maxOffset, Math.max(0, itemOffsets[index]));
          setOffset(itemsElmntRef.current, itemOffset - (height - itemSize) * position);
        },
      };
    }

    useEffect(() => {
      if (rootElmntRef.current) {
        heightRef.current = rootElmntRef.current.getBoundingClientRect().height;
      }
    }, []);

    useEffect(() => {
      if (itemsElmntRef.current) {
        const height = heightRef.current;
        const itemSize = itemSizes[scrollTo.index] || 0;
        const itemOffset = Math.min(maxOffset, Math.max(0, itemOffsets[scrollTo.index]));

        setOffset(
          itemsElmntRef.current,
          itemOffset - (height - itemSize) * (scrollTo.position || 0),
        );
      }
    }, [scrollTo]);

    useEffect(() => {
      const source = (eventSource || eventSourceRef?.current || rootElmntRef.current) as
        | HTMLElement
        | undefined;

      const itemsElmnt = itemsElmntRef.current;

      const scroll = (deltaY: number) => {
        // Don't allow scrolling if items don't fill the scroll window.
        if (totalSize < heightRef.current) {
          return;
        }

        setOffset(
          itemsElmnt,
          Math.min(maxOffset, Math.max(0, offsetRef.current + deltaY * scrollSpeed)),
        );
      };

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        scroll(event.deltaY);
      };

      const onTouchStart = (event: TouchEvent) => {
        if (touchInfoRef.current.pid) {
          clearInterval(touchInfoRef.current.pid);
          touchInfoRef.current.pid = undefined;
        }

        const t = event.timeStamp;
        const y = event.touches[0].clientY;
        touchInfoRef.current = { t, y, dy: 0 };
        event.preventDefault();
      };

      const onTouchMove = (event: TouchEvent) => {
        const t = event.timeStamp;
        const y = event.touches[0].clientY;
        const dy = touchInfoRef.current.y - y;
        scroll(dy);
        touchInfoRef.current = { t, y, dy };
        event.preventDefault();
      };

      const onTouchEnd = (event: TouchEvent) => {
        const touchInfo = touchInfoRef.current;

        const t = event.timeStamp;
        let speed = touchInfo.dy / (t - touchInfo.t);

        const pid = setInterval(() => {
          const dy = speed * 16;
          scroll(dy);
          speed = speed * 0.95;
          if (Math.abs(speed) < 0.01) {
            clearInterval(pid);
            touchInfoRef.current.pid = undefined;
          }
        }, 16);

        touchInfoRef.current = { ...touchInfo, pid };
        event.preventDefault();
      };

      const onWindowWheel = (event: WheelEvent) => {
        const target = event.target as HTMLDivElement;
        if (target.closest('.phnq-window-items')) {
          event.preventDefault();
        }
      };

      window.addEventListener('wheel', onWindowWheel, { passive: false });
      if (source) {
        source.addEventListener('wheel', onWheel, { passive: false });
        source.addEventListener('touchstart', onTouchStart);
        source.addEventListener('touchmove', onTouchMove);
        source.addEventListener('touchend', onTouchEnd);
      }
      return () => {
        window.removeEventListener('wheel', onWindowWheel);
        if (source) {
          source.removeEventListener('wheel', onWheel);
          source.removeEventListener('touchstart', onTouchStart);
          source.removeEventListener('touchmove', onTouchMove);
          source.removeEventListener('touchend', onTouchEnd);
        }
      };
    }, [totalSize, maxOffset, scrollSpeed]);

    const renderWindow = renderWindowRef.current;
    const sizes = itemSizes.slice(renderWindow.from, renderWindow.to);
    const renderedItems = items.slice(renderWindow.from, renderWindow.to);

    useEffect(() => {
      if (onRenderItems && renderedItems.length > 0) {
        onRenderItems({ items: renderedItems, startIndex: renderWindow.from });
      }
    }, [renderedItems]);

    const renderedItemsElements = renderedItems.map((item, i) => {
      const itemIndex = i + renderWindow.from;
      const renderedItem = children(item, itemIndex) as ReactElement;
      const { style, key } = renderedItem.props;
      return cloneElement(renderedItem, {
        key: key || itemIndex,
        style: { ...style, height: sizes[i], boxSizing: 'border-box' },
      });
    });

    return (
      <div ref={rootElmntRef} style={{ ...style, overflow: 'hidden' }} className={className}>
        <div ref={itemsElmntRef} style={{ willChange: 'transform' }} className="phnq-window-items">
          {renderedItemsElements}
        </div>
      </div>
    );
  },
);

const calculateSizes = (itemSize: ItemSize, count: number): number[] =>
  typeof itemSize === 'number'
    ? Array(count).fill(itemSize)
    : Array(count)
        .fill(0)
        .map((_, i) => itemSize(i));

const calculateOffsets = (itemSizes: number[]) => {
  const offsets = itemSizes.length === 0 ? [] : [0];
  for (let i = 0; i < itemSizes.length - 1; i++) {
    offsets.push(offsets[i] + itemSizes[i]);
  }
  return offsets;
};
