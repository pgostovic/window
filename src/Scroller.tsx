import React, {
  createRef,
  CSSProperties,
  FC,
  forwardRef,
  MutableRefObject,
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

interface Props {
  ref?: MutableRefObject<ScrollerRef>;
  items: unknown[];
  itemSize?: number | ((index: number) => number);
  scrollSpeed?: number;
  eventSource?: HTMLElement | (Window & typeof globalThis);
  eventSourceRef?: RefObject<HTMLElement>;
  style?: CSSProperties;
  className?: string;
  children(datum: unknown, index: number): ReactNode;
}

export interface ScrollerRef {
  scrollToItem(item: unknown): void;
  scrollToIndex(index: number): void;
}

const idIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `virtual-${i}`;
  }
})();

export const Scroller: FC<Props> = forwardRef(
  (
    {
      items,
      itemSize = DEFAULT_ITEM_SIZE,
      scrollSpeed = DEFAULT_SCROLL_SPEED,
      eventSource,
      eventSourceRef,
      style,
      className,
      children,
    },
    ref,
  ) => {
    const idRef = useRef(idIter.next().value);
    const offsetRef = useRef(0);
    const rootRef = createRef<HTMLDivElement>();
    const itemsRef = createRef<HTMLDivElement>();
    const [height, setHeight] = useState(0);
    const [firstVisible, setFirstVisible] = useState(0);

    const itemSizes: number[] = useMemo(() => {
      if (typeof itemSize === 'number') {
        return new Array(items.length).fill(itemSize);
      } else {
        return items.map((_, i) => itemSize(i));
      }
    }, [items, itemSize]);

    const itemOffsets = useMemo(() => {
      const offsets = [0];
      for (let i = 0; i < itemSizes.length - 1; i++) {
        offsets.push(offsets[i] + itemSizes[i]);
      }
      return offsets;
    }, [itemSizes]);

    const lastIndex = itemOffsets.length - 1;
    const totalSize = lastIndex === -1 ? 0 : itemOffsets[lastIndex] + itemSizes[lastIndex];
    const maxOffset = totalSize - height;

    if (ref) {
      (ref as MutableRefObject<ScrollerRef>).current = {
        scrollToItem(item: undefined) {
          this.scrollToIndex(items.indexOf(item));
        },
        scrollToIndex(index: number) {
          const newOffset = Math.max(-maxOffset, Math.min(0, -itemOffsets[index]));
          offsetRef.current = newOffset;
          if (itemsRef.current) {
            // TODO -- Scrolling to the last item will put it at the top with empty space below.
            const first = index;
            itemsRef.current.style.top = '0px';
            if (first !== firstVisible) {
              setFirstVisible(first);
            }
          }
        },
      };
    }

    useLayoutEffect(() => {
      if (rootRef.current) {
        setHeight(rootRef.current.getBoundingClientRect().height);
      }
    }, []);

    let numVisible = 0;
    let heightLeft = height;
    for (let i = firstVisible; i < items.length && heightLeft > 0; i++) {
      heightLeft -= itemSizes[i];
      numVisible++;
    }

    useEffect(() => {
      const source = (eventSource || eventSourceRef?.current || rootRef.current) as
        | HTMLElement
        | undefined;

      const itemsElmnt = itemsRef.current;

      const onWheel = (event: WheelEvent) => {
        // Don't allow scrolling if items don't fill the scroll window.
        if (totalSize < height) {
          return;
        }
        const newOffset = Math.max(
          -maxOffset,
          Math.min(0, offsetRef.current - event.deltaY * scrollSpeed),
        );
        offsetRef.current = newOffset;
        const first = Math.max(
          0,
          itemOffsets.findIndex(itemOffset => itemOffset >= -newOffset) - 1,
        );

        requestAnimationFrame(() => {
          if (itemsElmnt) {
            itemsElmnt.style.top = `${newOffset + (itemOffsets[first] || 0)}px`;
          }
        });
        if (first !== firstVisible) {
          setFirstVisible(first);
        }
      };

      if (source) {
        source.addEventListener('wheel', onWheel, { passive: true });
      }
      return () => {
        if (source) {
          source.removeEventListener('wheel', onWheel);
        }
      };
    }, [
      eventSource,
      eventSourceRef?.current,
      rootRef.current,
      itemsRef.current,
      firstVisible,
      totalSize,
      height,
      scrollSpeed,
    ]);

    const firstVisibleOffset = itemOffsets[firstVisible];

    return (
      <>
        <style>{getCommonStyle(idRef.current)}</style>
        <div ref={rootRef} id={idRef.current} style={getRootStyle(style)} className={className}>
          <div ref={itemsRef}>
            {items.slice(firstVisible, firstVisible + numVisible).map((item, i) => (
              <div
                key={i + firstVisible}
                style={{
                  top: itemOffsets[i + firstVisible] - firstVisibleOffset,
                  height: itemSizes[i + firstVisible],
                }}
              >
                {children(item, i + firstVisible)}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  },
);

const getRootStyle = (style?: CSSProperties): CSSProperties => ({
  ...style,
  position: 'relative',
  overflow: 'hidden',
});

const getCommonStyle = (id: string): string => `
  #${id} > div {
    position: absolute;
    left: 0;
    width: 100%;
    will-change: top;
  }

  #${id} > div > div {
    position: absolute;
    left: 0;
    width: 100%;
    will-change: top;
  }

  #${id} > div > div > * {
    height: 100%;
    box-sizing: border-box;
  }
`;
