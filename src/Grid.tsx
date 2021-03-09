import React, {
  cloneElement,
  createRef,
  CSSProperties,
  FC,
  isValidElement,
  ReactElement,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = 80;
const DEFAULT_SCROLL_SPEED = 1;
const DEFAULT_RENDER_BATCH_SIZE = 5;

type ItemSize = number | ((index: number) => number);

interface Props {
  rows: unknown[][];
  rowHeight?: ItemSize;
  colWidth?: ItemSize;
  initOffset?: { x: number; y: number };
  scrollSpeed?: number;
  eventSource?: HTMLElement | (Window & typeof globalThis);
  eventSourceRef?: RefObject<HTMLElement>;
  renderBatchSize?: number;
  onScrollStop?(offset: { x: number; y: number }): void;
  style?: CSSProperties;
  className?: string;
  children(cell: unknown, row: number, col: number): ReactNode;
}

interface TouchInfo {
  t: number;
  x: number;
  dx: number;
  y: number;
  dy: number;
  pid?: NodeJS.Timeout;
}

const Grid: FC<Props> = ({
  rows,
  rowHeight = DEFAULT_ROW_HEIGHT,
  colWidth = DEFAULT_COL_WIDTH,
  initOffset = { x: 0, y: 0 },
  scrollSpeed = DEFAULT_SCROLL_SPEED,
  eventSource,
  eventSourceRef,
  renderBatchSize = DEFAULT_RENDER_BATCH_SIZE,
  onScrollStop,
  style,
  className,
  children,
}) => {
  const rootElmntRef = createRef<HTMLDivElement>();
  const rowsElmntRef = createRef<HTMLDivElement>();
  const renderWindowRef = useRef({ fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 });
  const offsetRef = useRef(initOffset);
  const rafPidRef = useRef(0);
  const scrollPidRef = useRef<NodeJS.Timeout>();
  const touchInfoRef = useRef<TouchInfo>({ t: 0, x: 0, dx: 0, y: 0, dy: 0 });
  const windowSizeRef = useRef({ width: 0, height: 0 });
  const [, setRenderFlag] = useState(false); // this is to trigger a render

  const resizeObserver = useRef<ResizeObserver>();

  const numRows = rows.length;
  const numCols = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const rowHeights = useMemo(() => calculateSizes(rowHeight, numRows), [
    rows,
    rowHeight,
    windowSizeRef.current,
  ]);
  const rowOffsets = useMemo(() => calculateOffsets(rowHeights), [rowHeights]);
  const colWidths = useMemo(() => calculateSizes(colWidth, numCols), [
    rows,
    colWidth,
    windowSizeRef.current,
  ]);
  const colOffsets = useMemo(() => calculateOffsets(colWidths), [colWidths]);

  const totalSize = {
    width: numCols === 0 ? 0 : colOffsets[numCols - 1] + colWidths[numCols - 1],
    height: numRows === 0 ? 0 : rowOffsets[numRows - 1] + rowHeights[numRows - 1],
  };
  const maxOffset = {
    x: totalSize.width - windowSizeRef.current.width,
    y: totalSize.height - windowSizeRef.current.height,
  };

  useEffect(() => {
    const rootElmnt = rootElmntRef.current;
    if (rootElmnt) {
      resizeObserver.current = new ResizeObserver(() => {
        const { width, height } = rootElmnt.getBoundingClientRect();
        windowSizeRef.current = { width, height };
        setOffset(rowsElmntRef.current, offsetRef.current, true);
      });
      resizeObserver.current.observe(rootElmnt);
      return () => resizeObserver.current?.unobserve(rootElmnt);
    }
  }, []);

  const setOffset = useCallback(
    (rowsElmnt: HTMLDivElement | null, offset: { x: number; y: number }, force = false) => {
      if (
        rowsElmnt &&
        (force || offsetRef.current.x !== offset.x || offsetRef.current.y !== offset.y)
      ) {
        offsetRef.current = offset;
        const width = windowSizeRef.current.width;
        const height = windowSizeRef.current.height;
        const renderWindow = renderWindowRef.current;
        let { fromRow, toRow, fromCol, toCol } = renderWindow;

        const visibleFrom = {
          row: rowOffsets.findIndex(rowOffset => rowOffset >= offset.y),
          col: colOffsets.findIndex(colOffset => colOffset >= offset.x),
        };
        while (rowOffsets[visibleFrom.row] > offset.y) {
          visibleFrom.row -= 1;
        }
        while (colOffsets[visibleFrom.col] > offset.x) {
          visibleFrom.col -= 1;
        }

        const visibleTo = {
          row:
            height === 0
              ? numRows
              : rowOffsets.findIndex(rowOffset => rowOffset >= offset.y + height),
          col:
            width === 0
              ? numCols
              : colOffsets.findIndex(colOffset => colOffset >= offset.x + width),
        };
        if (visibleTo.row === -1) {
          visibleTo.row = numRows;
        }
        if (visibleTo.col === -1) {
          visibleTo.col = numCols;
        }

        if (visibleFrom.row < fromRow) {
          fromRow = visibleFrom.row - renderBatchSize;
          toRow = visibleTo.row;
        }

        if (visibleFrom.col < fromCol) {
          fromCol = visibleFrom.col - renderBatchSize;
          toCol = visibleTo.col;
        }

        if (visibleTo.row > toRow) {
          toRow = visibleTo.row + renderBatchSize;
          fromRow = visibleFrom.row;
        }

        if (visibleTo.col > toCol) {
          toCol = visibleTo.col + renderBatchSize;
          fromCol = visibleFrom.col;
        }

        fromRow = Math.max(fromRow, 0);
        toRow = Math.min(toRow, rowOffsets.length);
        fromCol = Math.max(fromCol, 0);
        toCol = Math.min(toCol, colOffsets.length);

        if (rafPidRef.current !== 0) {
          cancelAnimationFrame(rafPidRef.current);
        }
        rafPidRef.current = requestAnimationFrame(() => {
          rafPidRef.current = 0;

          // set rows container translate transform
          const translateY = -offset.y + (rowOffsets[fromRow] || 0);
          if (translateY > 0) {
            console.log('ProblemY', translateY, visibleFrom.row, visibleTo.row);
          }
          const translateX = -offset.x + (colOffsets[fromCol] || 0);
          if (translateX > 0) {
            console.log('ProblemX', translateX, visibleFrom.col, visibleTo.col);
          }
          rowsElmnt.style.transform = `translate(${translateX}px, ${translateY}px)`;

          // render rows if needed
          if (
            fromRow !== renderWindow.fromRow ||
            toRow !== renderWindow.toRow ||
            fromCol !== renderWindow.fromCol ||
            toCol !== renderWindow.toCol
          ) {
            renderWindowRef.current = { fromRow, toRow, fromCol, toCol };
            setRenderFlag(rf => !rf);
          }
        });
        return true;
      } else {
        return false;
      }
    },
    [rowOffsets, colOffsets, numRows, numCols],
  );

  useEffect(() => {
    const source = (eventSource || eventSourceRef?.current || rootElmntRef.current) as
      | HTMLElement
      | undefined;

    const rowsElmnt = rowsElmntRef.current;

    const scroll = (deltaX: number, deltaY: number) => {
      // Don't allow scrolling if grid fits inside the window.
      if (
        totalSize.width <= windowSizeRef.current.width &&
        totalSize.height <= windowSizeRef.current.height
      ) {
        return;
      }

      const effectiveDeltaX = windowSizeRef.current.width === 0 ? 0 : deltaX;
      const effectiveDeltaY = windowSizeRef.current.height === 0 ? 0 : deltaY;

      const offset = {
        x: Math.min(maxOffset.x, Math.max(0, offsetRef.current.x + effectiveDeltaX * scrollSpeed)),
        y: Math.min(maxOffset.y, Math.max(0, offsetRef.current.y + effectiveDeltaY * scrollSpeed)),
      };

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
      scroll(event.deltaX, event.deltaY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (touchInfoRef.current.pid) {
        clearInterval(touchInfoRef.current.pid);
        touchInfoRef.current.pid = undefined;
      }

      const t = event.timeStamp;
      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;
      touchInfoRef.current = { t, x, dx: 0, y, dy: 0 };
    };

    const onTouchMove = (event: TouchEvent) => {
      const t = event.timeStamp;
      const x = event.touches[0].clientX;
      const dx = touchInfoRef.current.x - x;
      const y = event.touches[0].clientY;
      const dy = touchInfoRef.current.y - y;
      scroll(dx, dy);
      touchInfoRef.current = { t, x, dx, y, dy };
    };

    const onTouchEnd = (event: TouchEvent) => {
      const touchInfo = touchInfoRef.current;

      const t = event.timeStamp;
      let speedX = touchInfo.dx / (t - touchInfo.t);
      let speedY = touchInfo.dy / (t - touchInfo.t);

      const pid = setInterval(() => {
        const dx = speedX * 16;
        const dy = speedY * 16;
        scroll(dx, dy);
        speedX = speedX * 0.95;
        speedY = speedY * 0.95;
        if (Math.abs(speedX) + Math.abs(speedY) < 0.01) {
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
  }, [totalSize.width, totalSize.height, maxOffset.x, maxOffset.y, scrollSpeed]);

  const renderedCells: ReactElement[] = [];
  const { fromRow, toRow, fromCol, toCol } = renderWindowRef.current;
  for (let r = fromRow; r < toRow; r += 1) {
    for (let c = fromCol; c < toCol; c += 1) {
      const renderedCell = children(rows[r][c], r, c);
      if (renderedCell) {
        const renderedCellElement = isValidElement(renderedCell) ? (
          renderedCell
        ) : (
          <div>{renderedCell}</div>
        );
        const { style, key } = renderedCellElement.props;
        renderedCells.push(
          cloneElement(renderedCellElement, {
            key: key || `${r}-${c}`,
            style: {
              ...style,
              boxSizing: 'border-box',
              position: 'absolute',
              width: px(colWidths[c]),
              height: px(rowHeights[r]),
              top: px(rowOffsets[r] - rowOffsets[fromRow]),
              left: px(colOffsets[c] - colOffsets[fromCol]),
            },
          }),
        );
      }
    }
  }

  const naturalHeight =
    windowSizeRef.current.height === 0 && renderWindowRef.current.toRow > 0
      ? `${totalSize.height}px`
      : undefined;
  const naturalWidth =
    windowSizeRef.current.width === 0 && renderWindowRef.current.toCol > 0
      ? `${totalSize.width}px`
      : undefined;

  const renderHeight =
    rowOffsets[renderWindowRef.current.toRow] - rowOffsets[renderWindowRef.current.fromRow];
  const renderWidth =
    colOffsets[renderWindowRef.current.toCol] - colOffsets[renderWindowRef.current.fromCol];

  return (
    <div
      ref={rootElmntRef}
      style={{ width: naturalWidth, height: naturalHeight, ...style, overflow: 'hidden' }}
      className={className}
    >
      <div
        ref={rowsElmntRef}
        style={{
          willChange: 'transform',
          position: 'relative',
          width: `${renderWidth}px`,
          height: `${renderHeight}px`,
          overflow: 'auto',
        }}
      >
        {renderedCells}
      </div>
    </div>
  );
};

const px = (size: number) => `${size}px`;

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

export default Grid;
