import React, {
  createRef,
  CSSProperties,
  FC,
  forwardRef,
  MutableRefObject,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  WheelEvent,
} from 'react';

const SCROLL_SPEED = 1;

interface Props {
  ref?: MutableRefObject<WindowRef>;
  items: unknown[];
  children(datum: unknown): ReactNode;
  style?: CSSProperties;
  className?: string;
  itemSize?: number;
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
  ({ items, children, style, className, itemSize = 40 }, ref) => {
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

    const onWheel = useCallback(
      (event: WheelEvent) => {
        const newOffset = Math.max(
          -maxOffest,
          Math.min(0, offsetRef.current - event.deltaY * SCROLL_SPEED),
        );
        offsetRef.current = newOffset;
        requestAnimationFrame(() => {
          if (itemsRef.current) {
            const first = Math.abs(Math.floor(newOffset / itemSize));
            itemsRef.current.style.top = `${newOffset + itemSize * first}px`;
            if (first !== firstVisible) {
              setFirstVisible(first);
            }
          }
        });
      },
      [height, firstVisible, itemsRef],
    );

    return (
      <>
        <style>{getCommonStyle(idRef.current, numVisible, itemSize)}</style>
        <div
          ref={rootRef}
          id={idRef.current}
          style={getRootStyle(style)}
          className={className}
          onWheel={onWheel}
        >
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

const getCommonStyle = (id: string, numItems: number, itemSize: number): string => `
  #${id} > div {
    position: absolute;
    left: 0;
    width: 100%;
    height: ${numItems * itemSize}px;
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
