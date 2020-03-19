import React, {
  createRef,
  CSSProperties,
  FC,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  WheelEvent,
} from 'react';

const SCROLL_SPEED = 1;

interface Props {
  items: unknown[];
  children(datum: unknown): ReactNode;
  style?: CSSProperties;
  className?: string;
  itemSize?: number;
}

const idIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `virtual-${i}`;
  }
})();

const Window: FC<Props> = ({ items, children, style, className, itemSize = 40 }) => {
  const idRef = useRef(idIter.next().value);
  const offsetRef = useRef(0);
  const rootRef = createRef<HTMLDivElement>();
  const itemsRef = createRef<HTMLDivElement>();
  const [height, setHeight] = useState(0);
  const [firstVisible, setFirstVisible] = useState(0);

  useLayoutEffect(() => {
    if (rootRef.current) {
      setHeight(rootRef.current.getBoundingClientRect().height);
    }
  }, []);

  const numVisible = Math.ceil(height / itemSize);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const maxOffest = items.length * itemSize - height;
      const newOffset = Math.max(
        -maxOffest,
        Math.min(0, offsetRef.current - event.deltaY * SCROLL_SPEED),
      );
      offsetRef.current = newOffset;
      if (itemsRef.current) {
        itemsRef.current.style.top = `${newOffset}px`;
        const first = Math.abs(Math.floor(newOffset / itemSize));
        if (first !== firstVisible) {
          setFirstVisible(first);
        }
      }
    },
    [height, firstVisible],
  );

  return (
    <>
      <style>{getCommonStyle(idRef.current, items.length, itemSize)}</style>
      <div
        ref={rootRef}
        id={idRef.current}
        style={getRootStyle(style)}
        className={className}
        onWheel={onWheel}
      >
        <div ref={itemsRef}>
          {items.slice(firstVisible, firstVisible + numVisible).map((item, i) => (
            <div key={i + firstVisible} style={{ top: (i + firstVisible) * itemSize }}>
              {children(item)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

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
  }

  #${id} > div > div {
    position: absolute;
    left: 0;
    width: 100%;
    height: ${itemSize}px;
  }

  #${id} > div > div > * {
    height: ${itemSize}px;
    box-sizing: border-box;
  }
`;

export default Window;
