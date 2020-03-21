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

const SCROLL_SPEED = 1;

interface Props {
  ref?: MutableRefObject<WindowRef>;
  items: unknown[];
  itemSize?: number;
  eventSourceRef?: RefObject<HTMLElement>;
  style?: CSSProperties;
  className?: string;
  children(datum: unknown): ReactNode;
}

export interface WindowRef {
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

const Window: FC<Props> = forwardRef(
  ({ items, itemSize = 40, eventSourceRef, style, className, children }, ref) => {
    const idRef = useRef(idIter.next().value);
    const offsetRef = useRef(0);
    const rootRef = createRef<HTMLDivElement>();
    const itemsRef = createRef<HTMLDivElement>();
    const [height, setHeight] = useState(0);
    const [firstVisible, setFirstVisible] = useState(0);

    const maxOffest = useMemo(() => items.length * itemSize - height, [
      itemSize,
      height,
      items.length,
    ]);

    if (ref) {
      (ref as MutableRefObject<WindowRef>).current = {
        scrollToItem(item: undefined) {
          this.scrollToIndex(items.indexOf(item));
        },
        scrollToIndex(index: number) {
          const newOffset = Math.max(-maxOffest, Math.min(0, -index * itemSize));
          offsetRef.current = newOffset;
          if (itemsRef.current) {
            const first = Math.abs(Math.floor(newOffset / itemSize));
            itemsRef.current.style.top = `${newOffset + itemSize * first}px`;
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

    const numVisible = Math.ceil(height / itemSize);

    useEffect(() => {
      const eventSource = eventSourceRef?.current || rootRef.current;
      const itemsElmnt = itemsRef.current;

      const onWheel = (event: globalThis.WheelEvent) => {
        const newOffset = Math.max(
          -maxOffest,
          Math.min(0, offsetRef.current - event.deltaY * SCROLL_SPEED),
        );
        offsetRef.current = newOffset;
        const first = Math.abs(Math.floor(newOffset / itemSize));
        requestAnimationFrame(() => {
          if (itemsElmnt) {
            itemsElmnt.style.top = `${newOffset + itemSize * first}px`;
          }
        });
        if (first !== firstVisible) {
          setFirstVisible(first);
        }
      };

      if (eventSource) {
        eventSource.addEventListener('wheel', onWheel, { passive: true });
      }
      return () => {
        if (eventSource) {
          eventSource.removeEventListener('wheel', onWheel);
        }
      };
    }, [eventSourceRef?.current, rootRef.current, itemsRef.current, firstVisible]);

    return (
      <>
        <style>{getCommonStyle(idRef.current, numVisible, itemSize)}</style>
        <div ref={rootRef} id={idRef.current} style={getRootStyle(style)} className={className}>
          <div ref={itemsRef}>
            {items.slice(firstVisible, firstVisible + numVisible).map((item, i) => (
              <div key={i + firstVisible} style={{ top: i * itemSize }}>
                {children(item)}
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

const getCommonStyle = (id: string, numVisible: number, itemSize: number): string => `
  #${id} > div {
    position: absolute;
    left: 0;
    width: 100%;
    height: ${numVisible * itemSize}px;
    will-change: top;
  }

  #${id} > div > div {
    position: absolute;
    left: 0;
    width: 100%;
    height: ${itemSize}px;
    will-change: top;
  }

  #${id} > div > div > * {
    height: ${itemSize}px;
    box-sizing: border-box;
  }
`;

export default Window;
