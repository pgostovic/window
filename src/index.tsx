import React, {
  cloneElement,
  createRef,
  CSSProperties,
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
const DEFAULT_ROW_SIZE = 40;

type ItemSize = number | ((index: number) => number);

interface Props {
  rows: unknown[];
  rowSize?: ItemSize;
  initScroll?: { index: number; position?: number };
  initOffset?: number;
  scrollSpeed?: number;
  eventSource?: HTMLElement | (Window & typeof globalThis);
  eventSourceRef?: RefObject<HTMLElement>;
  renderBatchSize?: number;
  onRenderRows?(info: { rows: unknown[]; startIndex: number }): void;
  onScrollStop?(offset: number): void;
  style?: CSSProperties;
  className?: string;
  children(row: unknown, index: number): ReactNode;
}

export interface ScrollerRef {
  scrollToRow(row: unknown, position?: number): void;
  scrollToIndex(index: number, position?: number): void;
  getOffset(): number;
  setOffset(offset: number): void;
}

interface TouchInfo {
  t: number;
  y: number;
  dy: number;
  pid?: NodeJS.Timeout;
}

export const Scroller = forwardRef<ScrollerRef, Props>(
  (
    {
      rows,
      rowSize = DEFAULT_ROW_SIZE,
      initScroll = { index: 0, position: 0 },
      scrollSpeed = DEFAULT_SCROLL_SPEED,
      initOffset,
      eventSource,
      eventSourceRef,
      renderBatchSize = 5,
      onRenderRows,
      onScrollStop,
      style,
      className,
      children,
    },
    r,
  ) => {
    const ref = r as MutableRefObject<ScrollerRef> | undefined;
    const rootElmntRef = createRef<HTMLDivElement>();
    const rowsElmntRef = createRef<HTMLDivElement>();
    const renderWindowRef = useRef({ from: 0, to: 0 });
    const offsetRef = useRef(-1);
    const rafPidRef = useRef(0);
    const scrollPidRef = useRef<NodeJS.Timeout>();
    const [, setRenderFlag] = useState(false); // this is to trigger a render

    const touchInfoRef = useRef<TouchInfo>({ t: 0, y: 0, dy: 0 });
    const heightRef = useRef(0);

    const rowSizes = useMemo(() => calculateSizes(rowSize, rows.length), [rows, rowSize]);
    const rowOffsets = useMemo(() => calculateOffsets(rowSizes), [rowSizes]);

    const setOffset = useCallback(
      (rowsElmnt: HTMLDivElement | null, offset: number) => {
        if (rowsElmnt && offsetRef.current !== offset) {
          offsetRef.current = offset;
          const height = heightRef.current;
          const renderWindow = renderWindowRef.current;
          let { from, to } = renderWindow;

          let visibleFrom = rowOffsets.findIndex(rowOffset => rowOffset >= offset);
          while (rowOffsets[visibleFrom] > offset) {
            visibleFrom -= 1;
          }
          let visibleTo = rowOffsets.findIndex(rowOffset => rowOffset >= offset + height);
          if (visibleTo === -1) {
            visibleTo = rows.length;
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
          to = Math.min(to, rowOffsets.length);

          if (rafPidRef.current !== 0) {
            cancelAnimationFrame(rafPidRef.current);
          }
          rafPidRef.current = requestAnimationFrame(() => {
            rafPidRef.current = 0;

            // set rows container translate transform
            const translateY = -offset + (rowOffsets[from] || 0);
            if (translateY > 0) {
              console.log('Problem', translateY, visibleFrom, visibleTo);
            }
            rowsElmnt.style.transform = `translateY(${translateY}px)`;

            // render rows if needed
            if (from !== renderWindow.from || to !== renderWindow.to) {
              renderWindowRef.current = { from, to };
              setRenderFlag(rf => !rf);
            }
          });
          return true;
        } else {
          return false;
        }
      },
      [rowOffsets],
    );

    const lastIndex = rows.length - 1;
    const totalSize = lastIndex === -1 ? 0 : rowOffsets[lastIndex] + rowSizes[lastIndex];
    const maxOffset = totalSize - heightRef.current;

    if (ref) {
      ref.current = {
        scrollToRow(row: undefined, position = 0) {
          this.scrollToIndex(rows.indexOf(row), position);
        },
        scrollToIndex(index: number, position = 0) {
          const height = heightRef.current;
          const rowSize = rowSizes[index] || 0;
          const rowOffset = Math.min(maxOffset, Math.max(0, rowOffsets[index]));
          setOffset(rowsElmntRef.current, rowOffset - (height - rowSize) * position);
        },
        getOffset() {
          return offsetRef.current;
        },
        setOffset(offset: number) {
          setOffset(rowsElmntRef.current, offset);
        },
      };
    }

    useEffect(() => {
      if (rootElmntRef.current) {
        heightRef.current = rootElmntRef.current.getBoundingClientRect().height;
      }
    }, []);

    useEffect(() => {
      if (rowsElmntRef.current) {
        if (initOffset !== undefined) {
          setOffset(rowsElmntRef.current, initOffset);
        } else {
          const height = heightRef.current;
          const rowSize = rowSizes[initScroll.index] || 0;
          const rowOffset = Math.min(maxOffset, Math.max(0, rowOffsets[initScroll.index]));
          setOffset(
            rowsElmntRef.current,
            rowOffset - (height - rowSize) * (initScroll.position || 0),
          );
        }
      }
    }, []);

    useEffect(() => {
      const source = (eventSource || eventSourceRef?.current || rootElmntRef.current) as
        | HTMLElement
        | undefined;

      const rowsElmnt = rowsElmntRef.current;

      const scroll = (deltaY: number) => {
        // Don't allow scrolling if rows don't fill the scroll window.
        if (totalSize < heightRef.current) {
          return;
        }

        const offset = Math.min(maxOffset, Math.max(0, offsetRef.current + deltaY * scrollSpeed));

        if (setOffset(rowsElmnt, offset)) {
          if (onScrollStop) {
            if (scrollPidRef.current) {
              clearTimeout(scrollPidRef.current);
              scrollPidRef.current = undefined;
            }
            scrollPidRef.current = setTimeout(() => {
              onScrollStop(offsetRef.current);
            }, 200);
          }
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
      };

      const onTouchMove = (event: TouchEvent) => {
        const t = event.timeStamp;
        const y = event.touches[0].clientY;
        const dy = touchInfoRef.current.y - y;
        scroll(dy);
        touchInfoRef.current = { t, y, dy };
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
      };

      const listenerOptions = mayUsePassive ? { passive: true } : false;

      if (source) {
        source.addEventListener('wheel', onWheel, listenerOptions);
        source.addEventListener('touchstart', onTouchStart, listenerOptions);
        source.addEventListener('touchmove', onTouchMove, listenerOptions);
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
    }, [totalSize, maxOffset, scrollSpeed]);

    const renderWindow = renderWindowRef.current;
    const isHeightLimited = heightRef.current > 0;
    const sizes = isHeightLimited ? rowSizes.slice(renderWindow.from, renderWindow.to) : rowSizes;
    const renderedRows = isHeightLimited ? rows.slice(renderWindow.from, renderWindow.to) : rows;

    useEffect(() => {
      if (onRenderRows && renderedRows.length > 0) {
        onRenderRows({ rows: renderedRows, startIndex: renderWindow.from });
      }
    }, [renderedRows]);

    const renderedRowsElements = renderedRows.map((row, i) => {
      const rowIndex = i + renderWindow.from;
      const renderedRow = children(row, rowIndex) as ReactElement;
      const { style, key } = renderedRow.props;
      return cloneElement(renderedRow, {
        key: key || rowIndex,
        style: { ...style, height: sizes[i], boxSizing: 'border-box' },
      });
    });

    return (
      <div ref={rootElmntRef} style={{ ...style, overflow: 'hidden' }} className={className}>
        <div ref={rowsElmntRef} style={{ willChange: 'transform' }}>
          {renderedRowsElements}
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

const mayUsePassive = (() => {
  try {
    let supportsPassive = false;
    const opts = Object.defineProperty({}, 'passive', {
      get(): boolean {
        supportsPassive = true;
        return true;
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const fn = () => {};
    window.addEventListener('testPassive', fn, opts);
    window.removeEventListener('testPassive', fn, opts);
    return supportsPassive;
  } catch (err) {
    return false;
  }
})();
