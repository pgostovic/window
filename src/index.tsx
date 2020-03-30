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
    const offsetRef = useRef(0);
    const touchInfoRef = useRef<TouchInfo>({ t: 0, y: 0, dy: 0 });
    const rootRef = createRef<HTMLDivElement>();
    const itemsRef = createRef<HTMLDivElement>();
    const [height, setHeight] = useState(0);
    const itemRenderIndexRef = useRef(0);
    const [, setRenderFlag] = useState(false); // this is to trigger a render

    const setItemRenderIndex = (index: number) => {
      itemRenderIndexRef.current = Math.max(0, index);
      setRenderFlag(rf => !rf);
    };

    const itemSizes = useMemo(() => calculateSizes(itemSize, items.length), [items, itemSize]);
    const itemOffsets = useMemo(() => calculateOffsets(itemSizes), [itemSizes]);

    const lastIndex = items.length - 1;
    const totalSize = lastIndex === -1 ? 0 : itemOffsets[lastIndex] + itemSizes[lastIndex];
    const maxOffset = totalSize - height;

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
          const newOffset = Math.min(maxOffset, Math.max(0, itemOffsets[index]));
          offsetRef.current = newOffset;
          requestAnimationFrame(() => {
            if (itemsRef.current) {
              itemsRef.current.style.transform = `translateY(0)`;
            }
          });

          const firstVisible = Math.max(
            0,
            itemOffsets.findIndex(itemOffset => itemOffset >= newOffset) - 1,
          );

          if (firstVisible !== itemRenderIndexRef.current) {
            setItemRenderIndex(firstVisible);
          }
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

        const newOffset = Math.min(
          maxOffset,
          Math.max(0, offsetRef.current + deltaY * scrollSpeed),
        );

        offsetRef.current = newOffset;

        const firstVisible = itemOffsets.findIndex(itemOffset => itemOffset >= newOffset);
        const lastVisible = itemOffsets.findIndex(itemOffset => itemOffset >= newOffset + height);

        if (lastVisible > itemRenderIndexRef.current + itemRenderCount) {
          setItemRenderIndex(itemRenderIndexRef.current + renderBatchSize);
        } else if (firstVisible < itemRenderIndexRef.current) {
          setItemRenderIndex(itemRenderIndexRef.current - renderBatchSize);
        } else {
          requestAnimationFrame(() => {
            if (itemsElmnt) {
              itemsElmnt.style.transform = `translateY(${-newOffset +
                (itemOffsets[itemRenderIndexRef.current] || 0)}px)`;
            }
          });
        }
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

    useLayoutEffect(() => {
      const itemsElmnt = itemsRef.current;
      requestAnimationFrame(() => {
        if (itemsElmnt) {
          itemsElmnt.style.transform = `translateY(${-offsetRef.current +
            (itemOffsets[itemRenderIndexRef.current] || 0)}px)`;
        }
      });
    }, [itemRenderIndexRef.current]);

    const sizes: (number | undefined)[] = itemSizes.slice(
      itemRenderIndexRef.current,
      itemRenderIndexRef.current + itemRenderCount,
    );

    const renderedItems = items
      .slice(itemRenderIndexRef.current, itemRenderIndexRef.current + itemRenderCount)
      .map((item, i) => {
        const itemIndex = i + itemRenderIndexRef.current;
        const renderedItem = children(item, itemIndex) as ReactElement;
        const { style, key } = renderedItem.props;
        return cloneElement(children(item, itemIndex) as ReactElement, {
          key: key || itemIndex,
          style: { ...style, height: sizes[i], boxSizing: 'border-box' },
        });
      });

    useEffect(() => {
      if (onRenderItems) {
        onRenderItems({ items: renderedItems, startIndex: itemRenderIndexRef.current });
      }
    }, [renderedItems]);

    return (
      <>
        <div ref={rootRef} style={{ ...style, overflow: 'hidden' }} className={className}>
          <div ref={itemsRef} style={{ willChange: 'transform' }}>
            {renderedItems}
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
