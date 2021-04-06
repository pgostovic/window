import React, {
  createRef,
  CSSProperties,
  forwardRef,
  MouseEvent,
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
import ResizeObserver from 'resize-observer-polyfill';

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = () => ({ flex: 1, min: 80 });
const DEFAULT_SCROLL_SPEED = 1;
const DEFAULT_RENDER_BATCH_SIZE = 5;

const scrollerClassIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `scr-${i}`;
  }
})();

export interface Cell {
  data: unknown;
  row: number;
  col: number;
}

interface FlexSize {
  flex: number;
  min: number;
}
type ItemSize = number | ((index: number) => number | FlexSize | 'natural');

interface CellSpan {
  rows: number;
  cols: number;
}

interface Props {
  rows: unknown[][] | unknown[];
  rowHeight?: ItemSize;
  colWidth?: ItemSize;
  cellSpan?(cell: Cell): CellSpan;
  stickyRows?: number[];
  stickyCols?: number[];
  initOffset?: { x: number; y: number };
  initScroll?: { row: number; col: number };
  scrollSpeed?: number;
  eventSource?: HTMLElement | (Window & typeof globalThis);
  eventSourceRef?: RefObject<HTMLElement>;
  renderBatchSize?: number;
  onRenderRows?(info: { rows: unknown[]; fromRow: number; fromCol: number }): void;
  onOffsetChange?(offset: { x: number; y: number; maxX: number; maxY: number }): void;
  onScrollStop?(offset: { x: number; y: number }): void;
  onCellClick?(cell: Cell, event: MouseEvent<HTMLElement>): void;
  allowShowOverflow?: boolean;
  style?: CSSProperties;
  className?: string;
  cellClassName?: string | ((cell: { row: number; col: number }) => string);
  stickyClassName?: string;
  children?(data: unknown, cell: Cell): ReactNode;
}

export interface ScrollerRef {
  scrollTo(cell: unknown): void;
  scrollTo(row: number, column: number): void;
  getOffset(): { x: number; y: number };
  setOffset(offset: { x: number; y: number }): void;
}

interface TouchInfo {
  t: number;
  x: number;
  dx: number;
  y: number;
  dy: number;
  pid?: NodeJS.Timeout;
}

export const Scroller = forwardRef<ScrollerRef, Props>(
  (
    {
      rows: rowsRaw,
      rowHeight = DEFAULT_ROW_HEIGHT,
      colWidth = DEFAULT_COL_WIDTH,
      cellSpan = () => ({ rows: 1, cols: 1 }),
      stickyRows = [],
      stickyCols = [],
      initOffset = { x: 0, y: 0 },
      initScroll,
      scrollSpeed = DEFAULT_SCROLL_SPEED,
      eventSource,
      eventSourceRef,
      renderBatchSize = DEFAULT_RENDER_BATCH_SIZE,
      onRenderRows,
      onOffsetChange,
      onScrollStop,
      onCellClick,
      allowShowOverflow = false,
      style,
      className,
      cellClassName,
      stickyClassName,
      children = cell => cell as ReactNode,
    },
    r,
  ) => {
    const ref = r as MutableRefObject<ScrollerRef> | undefined;
    const rows = useMemo(() => to2d(rowsRaw), [rowsRaw]);
    const rootElmntRef = createRef<HTMLDivElement>();
    const cellsElmntRef = createRef<HTMLDivElement>();
    const stickyRowsElmntRef = createRef<HTMLDivElement>();
    const stickyColsElmntRef = createRef<HTMLDivElement>();
    const renderWindowRef = useRef({ fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 });
    const offsetRef = useRef(initOffset);
    const rafPidRef = useRef(0);
    const scrollPidRef = useRef<NodeJS.Timeout>();
    const resizePidRef = useRef<NodeJS.Timeout>();
    const touchInfoRef = useRef<TouchInfo>({ t: 0, x: 0, dx: 0, y: 0, dy: 0 });
    const windowSizeRef = useRef({ width: 0, height: 0 });
    const sizeToFit = useRef({ width: true, height: true });
    const stuckRowsRef = useRef<number[]>([]);
    const stuckColsRef = useRef<number[]>([]);
    const [, setRenderFlag] = useState(false);
    const rootElmntClassName = useMemo(() => scrollerClassIter.next().value as string, []);
    const [rowHeightOverrides, setRowHeightOverrides] = useState<(number | undefined)[]>([]);
    const [colWidthOverrides, setColWidthOverrides] = useState<(number | undefined)[]>([]);
    const [showOverflow, setShowOverflow] = useState(false);

    if (ref) {
      ref.current = {
        scrollTo(...args: unknown[]) {
          if (args.length === 1) {
            const [cell] = args;
            if (numCols === 1) {
              const row = rows.findIndex(cells => cells.includes(cell));
              if (row !== -1) {
                const col = rows[row].indexOf(cell);
                if (col !== -1) {
                  this.scrollTo(row, col);
                }
              }
            }
          } else {
            const [row, col] = args as [number, number];
            this.setOffset({ x: colOffsets[col], y: rowOffsets[row] });
          }
        },
        getOffset() {
          return offsetRef.current;
        },
        setOffset(offset) {
          const cellsElmnt =
            cellsElmntRef.current ||
            document.querySelector(`.${rootElmntClassName} > .nonSticky > div`);
          const stickyRowsElmnt =
            stickyRowsElmntRef.current ||
            document.querySelector(`.${rootElmntClassName} > .stickyRows > div`);
          const stickyColsElmnt =
            stickyColsElmntRef.current ||
            document.querySelector(`.${rootElmntClassName} > .stickyCols > div`);

          setOffset(cellsElmnt, stickyRowsElmnt, stickyColsElmnt, offset);
        },
      };
    }

    const numRows = rows.length;
    const numCols = rows.reduce((max, row) => Math.max(max, row.length), 0);

    renderWindowRef.current = {
      fromRow: Math.max(0, Math.min(numRows - 1, renderWindowRef.current.fromRow)),
      toRow: Math.max(0, Math.min(numRows, renderWindowRef.current.toRow)),
      fromCol: Math.max(0, Math.min(numCols - 1, renderWindowRef.current.fromCol)),
      toCol: Math.max(0, Math.min(numCols, renderWindowRef.current.toCol)),
    };

    const rowHeights = useMemo(
      () => calculateSizes(rowHeight, numRows, windowSizeRef.current.height, rowHeightOverrides),
      [rows, rowHeight, windowSizeRef.current.height, rowHeightOverrides],
    );
    const rowOffsets = useMemo(() => calculateOffsets(rowHeights, rowHeightOverrides), [
      rowHeights,
      rowHeightOverrides,
    ]);
    const colWidths = useMemo(
      () => calculateSizes(colWidth, numCols, windowSizeRef.current.width, colWidthOverrides),
      [rows, colWidth, windowSizeRef.current.width, colWidthOverrides],
    );
    const colOffsets = useMemo(() => calculateOffsets(colWidths, colWidthOverrides), [
      colWidths,
      colWidthOverrides,
    ]);

    const totalSize = {
      width: numCols === 0 ? 0 : colOffsets[numCols - 1] + colWidths[numCols - 1],
      height: numRows === 0 ? 0 : rowOffsets[numRows - 1] + rowHeights[numRows - 1],
    };
    const maxOffset = {
      x: Math.max(0, totalSize.width - windowSizeRef.current.width),
      y: Math.max(0, totalSize.height - windowSizeRef.current.height),
    };

    const sortedStickyRows = [...stickyRows].sort((a, b) => a - b);
    const stickyRowOffsets = calculateOffsets(
      sortedStickyRows.map(r => rowHeights[r]),
      rowHeightOverrides,
    );

    const sortedStickyCols = [...stickyCols].sort((a, b) => a - b);
    const stickyColOffsets = calculateOffsets(
      sortedStickyCols.map(c => colWidths[c]),
      colWidthOverrides,
    );

    useEffect(() => {
      if (initScroll) {
        offsetRef.current = { x: colOffsets[initScroll.col], y: rowOffsets[initScroll.row] };
      }

      if (rootElmntRef.current) {
        const { width, height } = rootElmntRef.current.getBoundingClientRect();
        windowSizeRef.current = { width, height };
        sizeToFit.current = { width: width === 0, height: height === 0 };
      }

      reflow();
    }, []);

    useEffect(() => {
      // Do a reflow if the content has grown from being wholy contained inside the window
      // to being scrollable.
      const { toRow, toCol } = renderWindowRef.current;
      if (
        (toRow < numRows && rowOffsets[toRow - 1] < windowSizeRef.current.height) ||
        (toCol < numCols && colOffsets[toCol - 1] < windowSizeRef.current.width)
      ) {
        reflow();
      }

      // Do a reflow if the current offsets are out of bounds.
      // This can happen if rows are removed.
      if (offsetRef.current.x > maxOffset.x || offsetRef.current.y > maxOffset.y) {
        offsetRef.current.x = Math.min(offsetRef.current.x, maxOffset.x);
        offsetRef.current.y = Math.min(offsetRef.current.y, maxOffset.y);
        reflow();
      }
    });

    useEffect(() => {
      const heightOverrides = [...rowHeightOverrides];
      const { fromRow, toRow } = renderWindowRef.current;

      for (let i = fromRow; i < toRow; i += 1) {
        const isNatural = typeof rowHeight === 'function' && rowHeight(i) === 'natural';
        if (isNatural) {
          const cellElmnts = Array.prototype.slice.call(
            document.querySelectorAll(`.r${i}`),
          ) as HTMLElement[];
          const maxHeight = cellElmnts.reduce(
            (max, cellElmnt) => Math.max(max, cellElmnt.getBoundingClientRect().height),
            0,
          );
          heightOverrides[i] = maxHeight;
        } else {
          heightOverrides[i] = undefined;
        }
      }

      if (
        heightOverrides.slice(fromRow, toRow).join() !==
        rowHeightOverrides.slice(fromRow, toRow).join()
      ) {
        setRowHeightOverrides(heightOverrides);
      }
    });

    useEffect(() => {
      const widthOverrides = [...colWidthOverrides];
      const { fromCol, toCol } = renderWindowRef.current;

      for (let i = fromCol; i < toCol; i += 1) {
        const isNatural = typeof colWidth === 'function' && colWidth(i) === 'natural';
        if (isNatural) {
          const cellElmnts = Array.prototype.slice.call(
            document.querySelectorAll(`.c${i}`),
          ) as HTMLElement[];
          const maxWidth = cellElmnts.reduce(
            (max, cellElmnt) => Math.max(max, cellElmnt.getBoundingClientRect().width),
            0,
          );
          widthOverrides[i] = maxWidth;
        } else {
          widthOverrides[i] = undefined;
        }
      }

      if (
        widthOverrides.slice(fromCol, toCol).join() !==
        colWidthOverrides.slice(fromCol, toCol).join()
      ) {
        setColWidthOverrides(widthOverrides);
      }
    });

    useEffect(() => {
      const rootElmnt = rootElmntRef.current;
      if (rootElmnt) {
        const resizeObserver = new ResizeObserver(() => {
          if (resizePidRef.current) {
            clearTimeout(resizePidRef.current);
          }
          resizePidRef.current = setTimeout(() => {
            const { width, height } = rootElmnt.getBoundingClientRect();

            if (width !== windowSizeRef.current.width || height !== windowSizeRef.current.height) {
              windowSizeRef.current = { width, height };
              reflow();
              setRenderFlag(rf => !rf);
            }
          }, 200);
        });
        resizeObserver.observe(rootElmnt);
        return () => resizeObserver.unobserve(rootElmnt);
      }
    }, [setRenderFlag]);

    const reflow = () => {
      const rootElmnt = rootElmntRef.current || document.querySelector(`.${rootElmntClassName}`);
      const cellsElmnt =
        cellsElmntRef.current ||
        document.querySelector(`.${rootElmntClassName} > .nonSticky > div`);
      const stickyRowsElmnt =
        stickyRowsElmntRef.current ||
        document.querySelector(`.${rootElmntClassName} > .stickyRows > div`);
      const stickyColsElmnt =
        stickyColsElmntRef.current ||
        document.querySelector(`.${rootElmntClassName} > .stickyCols > div`);

      if (rootElmnt && cellsElmnt && stickyRowsElmnt && stickyColsElmnt) {
        setOffset(cellsElmnt, stickyRowsElmnt, stickyColsElmnt, offsetRef.current, true);
      }
    };

    const setOffset = useCallback(
      (
        cellsElmnt: HTMLDivElement | null,
        stickyRowsElmnt: HTMLDivElement | null,
        stickyColsElmnt: HTMLDivElement | null,
        offset: { x: number; y: number },
        force = false,
      ) => {
        if (
          cellsElmnt &&
          stickyRowsElmnt &&
          stickyColsElmnt &&
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
            row: sizeToFit.current.height
              ? numRows
              : rowOffsets.findIndex(rowOffset => rowOffset >= offset.y + height),
            col: sizeToFit.current.width
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

          const stuckRows = sortedStickyRows.filter(
            (r, i) => rowOffsets[r] - stickyRowOffsets[i] < offsetRef.current.y,
          );
          const stuckCols = sortedStickyCols.filter(
            (c, i) => colOffsets[c] - stickyColOffsets[i] < offsetRef.current.x,
          );

          if (rafPidRef.current !== 0) {
            cancelAnimationFrame(rafPidRef.current);
          }
          rafPidRef.current = requestAnimationFrame(() => {
            rafPidRef.current = 0;

            // Set rows container translate transform. Both translateY and translateX must be
            // negative to ensure content begins in the top left corner.
            const translateY = Math.min(0, -offset.y + (rowOffsets[fromRow] || 0));
            const translateX = Math.min(0, -offset.x + (colOffsets[fromCol] || 0));

            const stuckRowsHeight = stuckRows.reduce((h, r) => h + rowHeights[r], 0);
            const stuckColsWidth = stuckCols.reduce((w, c) => w + colWidths[c], 0);

            cellsElmnt.style.transform = `translate(${translateX - stuckColsWidth}px, ${translateY -
              stuckRowsHeight}px)`;
            stickyRowsElmnt.style.transform = `translateX(${translateX - stuckColsWidth}px)`;
            stickyColsElmnt.style.transform = `translateY(${translateY - stuckRowsHeight}px)`;

            // render rows if needed
            if (
              fromRow !== renderWindow.fromRow ||
              toRow !== renderWindow.toRow ||
              fromCol !== renderWindow.fromCol ||
              toCol !== renderWindow.toCol ||
              !same(stuckRows, stuckRowsRef.current) ||
              !same(stuckCols, stuckColsRef.current)
            ) {
              renderWindowRef.current = { fromRow, toRow, fromCol, toCol };
              stuckRowsRef.current = stuckRows;
              stuckColsRef.current = stuckCols;
              setRenderFlag(rf => !rf);
            }
          });

          if (onOffsetChange) {
            onOffsetChange({
              x: offsetRef.current.x,
              y: offsetRef.current.y,
              maxX: maxOffset.x,
              maxY: maxOffset.y,
            });
          }

          return true;
        } else {
          return false;
        }
      },
      [rowOffsets, colOffsets, numRows, numCols, sortedStickyRows.join(), sortedStickyCols.join()],
    );

    useEffect(() => {
      const source = (eventSource || eventSourceRef?.current || rootElmntRef.current) as
        | HTMLElement
        | undefined;

      const cellsElmnt = cellsElmntRef.current;
      const stickyRowsElmnt = stickyRowsElmntRef.current;
      const stickyColsElmnt = stickyColsElmntRef.current;

      const scroll = (deltaX: number, deltaY: number) => {
        // Don't allow scrolling if grid fits inside the window.
        if (
          totalSize.width <= windowSizeRef.current.width &&
          totalSize.height <= windowSizeRef.current.height
        ) {
          return;
        }

        const effectiveDeltaX = sizeToFit.current.width ? 0 : deltaX;
        const effectiveDeltaY = sizeToFit.current.height ? 0 : deltaY;

        const offset = {
          x: Math.min(
            maxOffset.x,
            Math.max(0, offsetRef.current.x + effectiveDeltaX * scrollSpeed),
          ),
          y: Math.min(
            maxOffset.y,
            Math.max(0, offsetRef.current.y + effectiveDeltaY * scrollSpeed),
          ),
        };

        if (setOffset(cellsElmnt, stickyRowsElmnt, stickyColsElmnt, offset)) {
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
        setShowOverflow(allowShowOverflow && event.altKey && event.metaKey);
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

    const { fromRow, toRow, fromCol, toCol } = renderWindowRef.current;

    useEffect(() => {
      if (onRenderRows) {
        onRenderRows({
          rows: rows.slice(fromRow, toRow).map(cols => cols.slice(fromCol, toCol)),
          fromRow,
          fromCol,
        });
      }
    }, [onRenderRows, fromRow, toRow, fromCol, toCol]);

    const visibleCells = useMemo(() => {
      const cells: boolean[][] = new Array(numRows)
        .fill(null)
        .map(() => new Array(numCols).fill(true));

      for (let r = fromRow; r < toRow; r += 1) {
        for (let c = fromCol; c < toCol; c += 1) {
          const span = cellSpan({ data: rows[r][c], row: r, col: c });
          if (span.rows !== 1 || span.cols !== 1) {
            for (let rr = 0; rr < span.rows; rr++) {
              for (let cc = 0; cc < span.cols; cc++) {
                if (rr !== 0 || cc !== 0) {
                  cells[r + rr][c + cc] = false;
                }
              }
            }
          }
        }
      }
      return cells;
    }, [rows, numCols, numRows, fromRow, toRow, fromCol, toCol]);

    const makeRenderedCell = (r: number, c: number) => {
      const renderedCell =
        visibleCells[r][c] && children(rows[r][c], { data: rows[r][c], row: r, col: c });
      if (renderedCell) {
        const span = cellSpan({ data: rows[r][c], row: r, col: c });

        const cellWidthOverridePx =
          span.cols === 1
            ? undefined
            : colWidths.slice(c, c + span.cols).reduce((cw, w) => cw + w, 0);

        const cellHeightOverridePx =
          span.rows === 1
            ? undefined
            : px(rowHeights.slice(r, r + span.rows).reduce((ch, h) => ch + h, 0));

        const explicitCellClass =
          typeof cellClassName === 'string'
            ? cellClassName
            : typeof cellClassName === 'function'
            ? cellClassName({ row: r, col: c })
            : undefined;

        return (
          <div
            key={`${r}-${c}`}
            style={{ width: cellWidthOverridePx, height: cellHeightOverridePx }}
            className={[`r${r} c${c}`, explicitCellClass].filter(Boolean).join(' ')}
          >
            {renderedCell}
          </div>
        );
      }
      return undefined;
    };

    const stuckRows = stuckRowsRef.current;
    const stuckCols = stuckColsRef.current;
    const stuckRowsHeight = stuckRows.reduce((h, r) => h + rowHeights[r], 0);
    const stuckColsWidth = stuckCols.reduce((w, c) => w + colWidths[c], 0);

    const rowStyles: string[] = [];
    const colStyles: string[] = [];

    const renderedCells: ReactElement[] = [];
    for (let r = fromRow; r < toRow; r += 1) {
      if (!stuckRows.includes(r)) {
        const rowTop = rowOffsets[r] - rowOffsets[fromRow];
        const height = rowHeights[r];
        const isNatural = typeof rowHeight === 'function' && rowHeight(r) === 'natural';
        if (isNatural) {
          rowStyles.push(`.${rootElmntClassName} > .window > div > .r${r} { top: ${px(rowTop)}; }`);
        } else {
          rowStyles.push(
            `.${rootElmntClassName} > .window > div > .r${r} { top: ${px(rowTop)}; height: ${px(
              height,
            )}; }`,
          );
        }
        for (let c = fromCol; c < toCol; c += 1) {
          if (!stuckCols.includes(c)) {
            const cell = makeRenderedCell(r, c);
            if (cell) {
              renderedCells.push(cell);
            }
          }
        }
      }
    }

    for (let c = fromCol; c < toCol; c += 1) {
      if (!stuckCols.includes(c)) {
        const colLeft = colOffsets[c] - colOffsets[fromCol];
        const width = colWidths[c];
        const isNatural = typeof colWidth === 'function' && colWidth(c) === 'natural';
        if (isNatural) {
          colStyles.push(
            `.${rootElmntClassName} > .window > div > .c${c} { left: ${px(colLeft)}; }`,
          );
        } else {
          colStyles.push(
            `.${rootElmntClassName} > .window > div > .c${c} { left: ${px(colLeft)}; width: ${px(
              width,
            )}; }`,
          );
        }
      }
    }

    const stuckRowCells: ReactElement[] = [];
    let stuckRowTop = 0;
    stuckRows.forEach(r => {
      const rowHeight = rowHeights[r];
      rowStyles.push(
        `.${rootElmntClassName} > .stickyRows > div > .r${r} { top: ${px(
          stuckRowTop,
        )}; height: ${px(rowHeight)}; }`,
      );
      for (let c = fromCol; c < toCol; c += 1) {
        if (!stuckCols.includes(c)) {
          const cell = makeRenderedCell(r, c);
          if (cell) {
            stuckRowCells.push(cell);
          }
        }
      }
      stuckRowTop += rowHeights[r];
    });

    const stuckColCells: ReactElement[] = [];
    let stuckColLeft = 0;
    stuckCols.forEach(c => {
      const colWidth = colWidths[c];
      colStyles.push(
        `.${rootElmntClassName} > .stickyCols > div > .c${c} { left: ${px(
          stuckColLeft,
        )}; width: ${px(colWidth)}; }`,
      );
      for (let r = fromRow; r < toRow; r += 1) {
        if (!stuckRows.includes(r)) {
          const cell = makeRenderedCell(r, c);
          if (cell) {
            stuckColCells.push(cell);
          }
        }
      }
      stuckColLeft += colWidths[c];
    });

    const stuckCells: ReactElement[] = [];
    stuckRowTop = 0;
    stuckRows.forEach(r => {
      stuckColLeft = 0;
      stuckCols.forEach(c => {
        const cell = makeRenderedCell(r, c);
        if (cell) {
          stuckCells.push(cell);
        }
        stuckColLeft += colWidths[c];
      });
      stuckRowTop += rowHeights[r];
    });

    stuckRowTop = 0;
    stuckRows.forEach(r => {
      const rowHeight = rowHeights[r];
      rowStyles.push(
        `.${rootElmntClassName} > .stickyCells > .r${r} { top: ${px(stuckRowTop)}; height: ${px(
          rowHeight,
        )}; }`,
      );
      stuckRowTop += rowHeight;
    });

    stuckColLeft = 0;
    stuckCols.forEach(c => {
      const colWidth = colWidths[c];
      rowStyles.push(
        `.${rootElmntClassName} > .stickyCells > .c${c} { left: ${px(stuckColLeft)}; width: ${px(
          colWidth,
        )}; }`,
      );
      stuckColLeft += colWidth;
    });

    const naturalHeight =
      sizeToFit.current.height && renderWindowRef.current.toRow > 0
        ? px(totalSize.height)
        : undefined;
    const naturalWidth =
      sizeToFit.current.width && renderWindowRef.current.toCol > 0
        ? px(totalSize.width)
        : undefined;

    const theStyle = `
      .${rootElmntClassName} {
        ${naturalWidth ? `width: ${naturalWidth}` : ''};
        ${naturalHeight ? `height: ${naturalHeight}` : ''};
        position: relative;
      }

      .${rootElmntClassName} > .window {
        position: absolute;
        overflow: ${showOverflow ? 'visible' : 'hidden'};
        top: ${px(stuckRowsHeight)};
        left: ${px(stuckColsWidth)};
        width: ${stuckColsWidth === 0 ? '100%' : `calc(100% - ${px(stuckColsWidth)})`};
        height: ${stuckRowsHeight === 0 ? '100%' : `calc(100% - ${px(stuckRowsHeight)})`};
      }

      .${rootElmntClassName} > .empty {
        display: none;
      }

      .${rootElmntClassName} > .stickyRows { top: 0; height: ${px(stuckRowsHeight)}; }
      .${rootElmntClassName} > .stickyCols { left: 0; width: ${px(stuckColsWidth)}; }

      .${rootElmntClassName} > .stickyCells {
        position: absolute;
        top: 0;
        left: 0;
        width: ${px(stuckColsWidth)};
        height: ${px(stuckRowsHeight)};
      }

      .${rootElmntClassName} > .window > div
      {
        will-change: transform;
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
      }
      
      .${rootElmntClassName} > .stickyCells > *,
      .${rootElmntClassName} > .window > div > *
      {
        box-sizing: border-box;
        position: absolute;
      }

      ${rowStyles.join('\n')}
      ${colStyles.join('\n')}
    `;

    const onClick = useCallback(
      (event: MouseEvent<HTMLElement>) => {
        if (onCellClick) {
          const cell = cellFromEvent(event.nativeEvent, rows);
          if (cell) {
            onCellClick(cell, event);
          }
        }
      },
      [onCellClick, rows],
    );

    const hasStuckRows = stuckRowCells.length > 0;
    const hasStuckCols = stuckColCells.length > 0;

    return (
      <>
        <style>{theStyle}</style>
        <div
          ref={rootElmntRef}
          style={style}
          className={[rootElmntClassName, className].filter(Boolean).join(' ')}
          onClick={onCellClick ? onClick : undefined}
        >
          <div className="window nonSticky">
            <div ref={cellsElmntRef} className="cells">
              {renderedCells}
            </div>
          </div>

          <div
            className={[stickyClassName, 'window', 'stickyRows', !hasStuckRows && 'empty']
              .filter(Boolean)
              .join(' ')}
          >
            <div ref={stickyRowsElmntRef} className="cells">
              {stuckRowCells}
            </div>
          </div>

          <div
            className={[stickyClassName, 'window', 'stickyCols', !hasStuckCols && 'empty']
              .filter(Boolean)
              .join(' ')}
          >
            <div ref={stickyColsElmntRef} className="cells">
              {stuckColCells}
            </div>
          </div>

          <div
            className={[
              'cells',
              'stickyCells',
              !(hasStuckRows && hasStuckCols) && 'empty',
              stickyClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {stuckCells}
          </div>
        </div>
      </>
    );
  },
);

const px = (size: number) => (size === 0 ? 0 : `${size}px`);

const calculateSizes = (
  itemSize: ItemSize,
  count: number,
  maxSize: number,
  sizeOverrides: (number | undefined)[],
): number[] => {
  if (typeof itemSize === 'number') {
    return Array(count).fill(itemSize);
  } else {
    const sizes = Array(count)
      .fill(0)
      .map((_, i) => itemSize(i));

    const staticSizes = sizes.filter(s => typeof s === 'number') as number[];
    if (staticSizes.length === sizes.length) {
      return staticSizes;
    }

    const staticSize = staticSizes.reduce((t, s) => t + s, 0);
    const flexSizes = sizes.filter(s => typeof s === 'object') as FlexSize[];
    const minSize = staticSize + flexSizes.reduce((t, s) => t + s.min, 0);
    if (minSize < maxSize) {
      const remainder = maxSize - staticSize;
      const remainderPerFlex = remainder / flexSizes.reduce((t, s) => t + s.flex, 0);
      return sizes.map((s, i) =>
        sizeOverrides[i] || s === 'natural'
          ? -1
          : typeof s === 'number'
          ? s
          : s.flex * remainderPerFlex,
      );
    } else {
      return sizes.map(
        (s, i) => sizeOverrides[i] || (s === 'natural' ? -1 : typeof s === 'number' ? s : s.min),
      );
    }
  }
};

const calculateOffsets = (itemSizes: number[], sizeOverrides: (number | undefined)[]) => {
  const offsets = itemSizes.length === 0 ? [] : [0];
  for (let i = 0; i < itemSizes.length - 1; i++) {
    offsets.push(offsets[i] + (sizeOverrides[i] || itemSizes[i]));
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

const same = (nums1: number[], nums2: number[]) => {
  if (nums1.length === nums2.length) {
    for (let i = 0; i < nums1.length; i += 1) {
      if (nums1[i] !== nums2[i]) {
        return false;
      }
    }
    return true;
  }
  return false;
};

const to2d = (rows: Array<unknown | unknown[]>): unknown[][] =>
  rows.map(row => (row instanceof Array ? (row as unknown[]) : [row]));

const cellFromEvent = (event: Event, rows: unknown[][]): Cell | undefined => {
  let cellElmnt = event.target as HTMLElement | null;
  while (cellElmnt) {
    const parentElement = cellElmnt.parentElement;
    if (parentElement?.className.split(' ').includes('cells')) {
      break;
    } else {
      cellElmnt = parentElement;
    }
  }
  if (cellElmnt) {
    const classNames = cellElmnt.className.split(' ');
    const { row, col } = classNames.reduce(
      (coords, cn) => {
        const m = cn.match(/([rc])(\d+)/);
        if (m && m[1] === 'r') {
          return { ...coords, row: Number(m[2]) };
        } else if (m && m[1] === 'c') {
          return { ...coords, col: Number(m[2]) };
        }
        return coords;
      },
      { row: -1, col: -1 },
    );
    return { row, col, data: rows[row][col] };
  }
};
