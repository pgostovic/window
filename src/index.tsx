import React, {
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
  style?: CSSProperties;
  className?: string;
  children(item: unknown, index: number): ReactNode;
}

export interface ScrollerRef {
  scrollToItem(item: unknown): void;
  scrollToIndex(index: number): void;
}

const idIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `scroller-${i}`;
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
      renderBatchSize = 5,
      style,
      className,
      children,
    },
    ref,
  ) => {
    const id: string = useMemo(() => idIter.next().value, []);
    const offsetRef = useRef(0);
    const rootRef = createRef<HTMLDivElement>();
    const itemsRef = createRef<HTMLDivElement>();
    const [height, setHeight] = useState(0);
    const itemRenderIndexRef = useRef(0);
    const [, setRenderFlag] = useState(false); // this is to trigger a render

    const setItemRenderIndex = (index: number) => {
      itemRenderIndexRef.current = index;
      setRenderFlag(rf => !rf);
    };

    const itemSizes = useMemo(() => calcSizes(itemSize, items.length), [items, itemSize]);
    const itemOffsets = useMemo(() => calcOffsets(itemSizes), [itemSizes]);

    const lastIndex = items.length - 1;
    const totalSize = lastIndex === -1 ? 0 : itemOffsets[lastIndex] + itemSizes[lastIndex];
    const maxOffset = totalSize - height;

    const r = ref;

    let itemRenderCount = renderBatchSize;
    let heightLeft = height;
    for (let i = itemRenderIndexRef.current; i < items.length && heightLeft > 0; i++) {
      heightLeft -= itemSizes[i];
      itemRenderCount++;
    }

    if (r) {
      (r as MutableRefObject<ScrollerRef>).current = {
        scrollToItem(item: undefined) {
          this.scrollToIndex(items.indexOf(item));
        },
        scrollToIndex(index: number) {
          const newOffset = Math.min(maxOffset, Math.max(0, itemOffsets[index]));
          offsetRef.current = newOffset;
          // TODO -- Scrolling to the last item will put it at the top with empty space below.
          requestAnimationFrame(() => {
            if (itemsRef.current) {
              itemsRef.current.style.transform = `translateY(0)`;
            }
          });
          if (index !== itemRenderIndexRef.current) {
            setItemRenderIndex(index);
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

      const onWheel = (event: WheelEvent) => {
        // Don't allow scrolling if items don't fill the scroll window.
        if (totalSize < height) {
          return;
        }

        const newOffset = Math.min(
          maxOffset,
          Math.max(0, offsetRef.current + event.deltaY * scrollSpeed),
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
      totalSize,
      height,
      scrollSpeed,
    ]);

    useLayoutEffect(() => {
      const itemsElmnt = itemsRef.current;
      requestAnimationFrame(() => {
        if (itemsElmnt) {
          itemsElmnt.style.transform = `translateY(${-offsetRef.current +
            (itemOffsets[itemRenderIndexRef.current] || 0)}px)`;
        }
      });
    }, [itemsRef.current, itemRenderIndexRef.current]);

    const renderedItemSizes: (number | undefined)[] = itemSizes.slice(
      itemRenderIndexRef.current,
      itemRenderIndexRef.current + itemRenderCount,
    );

    const renderedItems = items
      .slice(itemRenderIndexRef.current, itemRenderIndexRef.current + itemRenderCount)
      .map((item, i) => {
        const renderedItem = children(item, i + itemRenderIndexRef.current) as ReactElement;
        const itemStyle = renderedItem.props.style;
        if (itemStyle) {
          itemStyle.height = renderedItemSizes[i];
          renderedItemSizes[i] = undefined;
        }
        return renderedItem;
      });

    return (
      <>
        <style>{getCommonStyle(id, renderedItemSizes)}</style>
        <div ref={rootRef} style={getRootStyle(style)} className={className}>
          <div id={id} ref={itemsRef}>
            {renderedItems}
          </div>
        </div>
      </>
    );
  },
);

const getRootStyle = (style?: CSSProperties): CSSProperties => ({
  ...style,
  overflow: 'hidden',
});

const getCommonStyle = (id: string, itemSizes: (number | undefined)[]): string =>
  [
    `#${id} { will-change: transform; }`,
    `#${id} > * { box-sizing: border-box;}`,
    ...itemSizes
      .map((size, i) =>
        typeof size === 'number'
          ? `#${id} > *:nth-child(${i + 1}) { height: ${size}px; }`
          : undefined,
      )
      .filter(Boolean),
  ].join('\n');

const calcSizes = (itemSize: ItemSize, count: number): number[] =>
  typeof itemSize === 'number'
    ? Array(count).fill(itemSize)
    : Array(count)
        .fill(0)
        .map((_, i) => itemSize(i));

const calcOffsets = (itemSizes: number[]) => {
  const offsets = itemSizes.length === 0 ? [] : [0];
  for (let i = 0; i < itemSizes.length - 1; i++) {
    offsets.push(offsets[i] + itemSizes[i]);
  }
  return offsets;
};
