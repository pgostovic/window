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
  useLayoutEffect,
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
  scrollToIndex?: number;
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
  scrollToItem(item: unknown): void;
  scrollToIndex(index: number): void;
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
      scrollToIndex = 0,
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
    const rootRef = createRef<HTMLDivElement>();
    const itemsRef = createRef<HTMLDivElement>();
    const itemRenderIndexRef = useRef(0);
    const offsetRef = useRef(0);
    const rafPidRef = useRef(0);
    const scrollToIndexRef = useRef(0);
    const touchInfoRef = useRef<TouchInfo>({ t: 0, y: 0, dy: 0 });

    const [height, setHeight] = useState(0);
    const [, setRenderFlag] = useState(false); // this is to trigger a render

    const itemSizes = useMemo(() => calculateSizes(itemSize, items.length), [items, itemSize]);
    const itemOffsets = useMemo(() => calculateOffsets(itemSizes), [itemSizes]);

    const setOffset = useCallback(
      (itemsElmnt: HTMLDivElement | null, offset: number) => {
        offsetRef.current = offset;
        if (itemsElmnt) {
          let itemRenderIndex = itemRenderIndexRef.current;

          const firstVisible = itemOffsets.findIndex(itemOffset => itemOffset >= offset);
          const lastVisible = itemOffsets.findIndex(itemOffset => itemOffset >= offset + height);

          if (lastVisible > itemRenderIndex + itemRenderCount) {
            itemRenderIndex = Math.max(
              lastVisible - itemRenderCount,
              itemRenderIndex + renderBatchSize,
            );
          } else if (firstVisible < itemRenderIndex) {
            itemRenderIndex = Math.max(
              0,
              Math.min(firstVisible, itemRenderIndex - renderBatchSize),
            );
          }

          if (rafPidRef.current !== 0) {
            cancelAnimationFrame(rafPidRef.current);
          }
          rafPidRef.current = requestAnimationFrame(() => {
            rafPidRef.current = 0;

            // set items container translate transform
            const translateY = -offset + (itemOffsets[itemRenderIndex] || 0);
            itemsElmnt.style.transform = `translateY(${translateY}px)`;

            // render items if needed
            if (itemRenderIndex !== itemRenderIndexRef.current) {
              itemRenderIndexRef.current = itemRenderIndex;
              setRenderFlag(rf => !rf);
            }
          });
        }
      },
      [height, itemOffsets],
    );

    const lastIndex = items.length - 1;
    const totalSize = lastIndex === -1 ? 0 : itemOffsets[lastIndex] + itemSizes[lastIndex];
    const maxOffset = totalSize - height;

    if (scrollToIndex !== scrollToIndexRef.current) {
      offsetRef.current = Math.min(maxOffset, Math.max(0, itemOffsets[scrollToIndex]));
      itemRenderIndexRef.current = scrollToIndex;
      scrollToIndexRef.current = scrollToIndex;
    }

    let itemRenderCount = renderBatchSize;
    let heightLeft = height;
    for (let i = itemRenderIndexRef.current; i < items.length && heightLeft > 0; i++) {
      heightLeft -= itemSizes[i];
      itemRenderCount++;
    }

    if (ref) {
      (ref as MutableRefObject<ScrollerRef>).current = {
        scrollToItem(item: undefined) {
          this.scrollToIndex(items.indexOf(item));
        },
        scrollToIndex(index: number) {
          setOffset(itemsRef.current, Math.min(maxOffset, Math.max(0, itemOffsets[index])));
        },
      };
    }

    useLayoutEffect(() => {
      if (rootRef.current) {
        setHeight(rootRef.current.getBoundingClientRect().height);
      }
    }, []);

    useEffect(() => {
      const source = (eventSource || eventSourceRef?.current || rootRef.current) as
        | HTMLElement
        | undefined;

      const itemsElmnt = itemsRef.current;

      const scroll = (deltaY: number) => {
        // Don't allow scrolling if items don't fill the scroll window.
        if (totalSize < height) {
          return;
        }

        setOffset(
          itemsElmnt,
          Math.min(maxOffset, Math.max(0, offsetRef.current + deltaY * scrollSpeed)),
        );
      };

      const onWheel = (event: WheelEvent) => {
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

      if (source) {
        source.addEventListener('wheel', onWheel, { passive: true });
        source.addEventListener('touchstart', onTouchStart);
        source.addEventListener('touchmove', onTouchMove);
        source.addEventListener('touchend', onTouchEnd);
      }
      return () => {
        if (source) {
          source.removeEventListener('wheel', onWheel);
          source.removeEventListener('touchstart', onTouchStart);
          source.removeEventListener('touchmove', onTouchMove);
          source.removeEventListener('touchend', onTouchEnd);
        }
      };
    }, [totalSize, height, scrollSpeed]);

    const sizes: (number | undefined)[] = useMemo(
      () =>
        itemSizes.slice(itemRenderIndexRef.current, itemRenderIndexRef.current + itemRenderCount),
      [itemRenderIndexRef.current, itemRenderCount],
    );

    const renderedItems = useMemo(
      () => items.slice(itemRenderIndexRef.current, itemRenderIndexRef.current + itemRenderCount),
      [itemRenderIndexRef.current, itemRenderCount],
    );

    useEffect(() => {
      if (onRenderItems) {
        onRenderItems({ items: renderedItems, startIndex: itemRenderIndexRef.current });
      }
    }, [renderedItems]);

    const renderedItemsElements = renderedItems.map((item, i) => {
      const itemIndex = i + itemRenderIndexRef.current;
      const renderedItem = children(item, itemIndex) as ReactElement;
      const { style, key } = renderedItem.props;
      return cloneElement(children(item, itemIndex) as ReactElement, {
        key: key || itemIndex,
        style: { ...style, height: sizes[i], boxSizing: 'border-box' },
      });
    });

    return (
      <>
        <div ref={rootRef} style={{ ...style, overflow: 'hidden' }} className={className}>
          <div ref={itemsRef} style={{ willChange: 'transform' }}>
            {renderedItemsElements}
          </div>
        </div>
      </>
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
