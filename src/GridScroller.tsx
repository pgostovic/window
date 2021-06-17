import React, {
  createRef,
  CSSProperties,
  FC,
  forwardRef,
  MutableRefObject,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  WheelEvent as ReactWheelEvent,
} from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import styled from 'styled-components';

import GridLayout, { StuckCols, StuckRows, WindowCellsRect } from './GridLayout';

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = () => ({ flex: 1, min: 80 });

const scrollerIdIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `scr-${i}`;
  }
})();

export interface ScrollerRef {
  scrollTo(cell: unknown): void;
  scrollTo(row: number, column: number): void;
  getScrollPosition(): { left: number; top: number };
  setScrollPosition(offset: { left: number; top: number }): void;
}

export type EventType =
  | 'click'
  | 'contextmenu'
  | 'dblclick'
  | 'drag'
  | 'dragend'
  | 'dragenter'
  | 'dragexit'
  | 'dragleave'
  | 'dragover'
  | 'dragstart'
  | 'drop'
  | 'mousedown'
  | 'mouseenter'
  | 'mouseleave'
  | 'mousemove'
  | 'mouseout'
  | 'mouseover'
  | 'mouseup';

interface FlexSize {
  flex: number;
  min: number;
}
type ItemSize = number | ((index: number) => number | FlexSize | 'natural');

interface CellSpan {
  row: number;
  col: number;
  rows: number;
  cols: number;
}

export interface Cell {
  row: number;
  col: number;
  data: unknown;
}

interface SizeOverrides {
  [key: number]: number;
}

interface Props {
  rows: unknown[][] | unknown[];
  rowHeight?: ItemSize;
  colWidth?: ItemSize;
  stickyRows?: number[];
  stickyCols?: number[];
  cellSpans?: CellSpan[];
  fixedMarginContent?: {
    top?: { height: number; node: ReactNode };
    bottom?: { height: number; node: ReactNode };
    left?: { width: number; node: ReactNode };
    right?: { width: number; node: ReactNode };
  };
  initPosition?: { row: number; col: number };
  initScrollPosition?: { left: number; top: number };
  arrowScrollAmount?: number | { x: number; y: number };
  cellEventTypes?: EventType[];
  onCellEvent?(type: EventType, cell: Cell, event: Event): void;
  scrollEventSource?: HTMLElement;
  renderBatchSize?: number;
  renderThreshold?: number;
  cellClassName?(cell: Cell): string;
  children?(data: unknown, cell: Cell): ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const Scroller = forwardRef<ScrollerRef, Props>(
  (
    {
      rows: rowsRaw,
      rowHeight = DEFAULT_ROW_HEIGHT,
      colWidth = DEFAULT_COL_WIDTH,
      stickyRows = [],
      stickyCols = [],
      cellSpans = [],
      initPosition,
      cellEventTypes = [],
      onCellEvent,
      initScrollPosition = { left: 0, top: 0 },
      scrollEventSource,
      cellClassName,
      children: renderCell = data => data as ReactNode,
      style,
      className,
    },
    ref,
  ) => {
    performance.mark('render');

    // Refs
    const gridLayoutRef = useRef(new GridLayout());
    const resizePidRef = useRef<NodeJS.Timeout>();
    const rootElmntRef = createRef<HTMLDivElement>();
    const cellsElmntRef = createRef<HTMLDivElement>();
    const stuckRowCellsElmntRef = createRef<HTMLDivElement>();
    const stuckColCellsElmntRef = createRef<HTMLDivElement>();

    // State
    const [windowCellsRect, setWindowCellsRect] = useState<WindowCellsRect>({ row: 0, col: 0, numRows: 0, numCols: 0 });
    const [stuckRows, setStuckRows] = useState<StuckRows>({});
    const [stuckCols, setStuckCols] = useState<StuckCols>({});
    const [rowHeightOverrides, setRowHeightOverrides] = useState<SizeOverrides>({});
    const [colWidthOverrides, setColWidthOverrides] = useState<SizeOverrides>({});

    /** Range of cells to render. */
    const renderFromRow = windowCellsRect.row;
    const renderToRow = renderFromRow + windowCellsRect.numRows;
    const renderFromCol = windowCellsRect.col;
    const renderToCol = renderFromCol + windowCellsRect.numCols;

    /** Unique id for this scroller. */
    const scrollerId = useMemo(() => scrollerIdIter.next().value as string, []);

    /** Convert to 2d array if rows were supplied as a 1d array. */
    const rows = useMemo(() => to2d(rowsRaw), [rowsRaw]);

    /** Number of rows of data. */
    const numRows = rows.length;

    /** Number of columns of data. */
    const numCols = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 0), [rows]);

    /** Row positions -- height and y location of each row. */
    const rowPositions = useMemo(() => {
      const gridLayout = gridLayoutRef.current;
      const heights = calculateSizes(rowHeight, numRows, gridLayout.getWindowRect().height, rowHeightOverrides);
      gridLayout.setRowHeights(heights);
      return gridLayout.getRowPositions();
    }, [rows, rowHeight, rowHeightOverrides, gridLayoutRef.current.getWindowRect().height]);

    /** Col positions -- width and x location of each column. */
    const colPositions = useMemo(() => {
      const gridLayout = gridLayoutRef.current;
      const widths = calculateSizes(colWidth, numCols, gridLayout.getWindowRect().width, colWidthOverrides);
      gridLayout.setColWidths(widths);
      return gridLayout.getColPositions();
    }, [rows, colWidth, colWidthOverrides, gridLayoutRef.current.getWindowRect().width]);

    gridLayoutRef.current.setStickyRows(stickyRows);
    gridLayoutRef.current.setStickyCols(stickyCols);

    /**
     * TODO: memoize with useCallback()? I think it's not needed.
     */
    gridLayoutRef.current.updateHandler = ({ translate, cellsRect, stuckCols, stuckRows }) => {
      const cellsElmnt = cellsElmntRef.current;
      if (cellsElmnt) {
        cellsElmnt.style.transform = `translate(${translate.x}px, ${translate.y}px)`;
      }

      const stuckRowCellsElmnt = stuckRowCellsElmntRef.current;
      if (stuckRowCellsElmnt) {
        stuckRowCellsElmnt.style.transform = `translateX(${translate.x}px)`;
      }

      const stuckColCellsElmnt = stuckColCellsElmntRef.current;
      if (stuckColCellsElmnt) {
        stuckColCellsElmnt.style.transform = `translateY(${translate.y}px)`;
      }

      if (cellsRect) {
        setWindowCellsRect(cellsRect);
      }
      if (stuckCols) {
        setStuckCols(stuckCols);
      }
      if (stuckRows) {
        setStuckRows(stuckRows);
      }
    };

    /**
     * Programmatic API for Scroller.
     */
    const scrollerApi: ScrollerRef = useMemo(
      () => ({
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
            this.setScrollPosition({ left: colPositions[col].x, top: rowPositions[row].y });
          }
        },
        getScrollPosition() {
          const { x, y } = gridLayoutRef.current.getWindowRect();
          return { left: x, top: y };
        },
        setScrollPosition(scrollPosition) {
          gridLayoutRef.current.moveWindow(scrollPosition.left, scrollPosition.top);
        },
      }),
      [rows, colPositions, rowPositions],
    );

    if (ref) {
      (ref as MutableRefObject<ScrollerRef>).current = scrollerApi;
    }

    // Detect initial and changes in root element size.
    useEffect(() => {
      const rootElmnt = rootElmntRef.current;
      if (rootElmnt) {
        if (initPosition) {
          gridLayoutRef.current.moveWindow(colPositions[initPosition.col].x, rowPositions[initPosition.row].y);
        } else {
          gridLayoutRef.current.moveWindow(initScrollPosition.left, initScrollPosition.top);
        }

        const detectSize = () => {
          const { width, height } = rootElmnt.getBoundingClientRect();
          gridLayoutRef.current.setWindowSize(width, height);
        };

        detectSize();

        const resizeObserver = new ResizeObserver(() => {
          if (resizePidRef.current) {
            clearTimeout(resizePidRef.current);
            resizePidRef.current = undefined;
          } else {
            detectSize();
          }
          resizePidRef.current = setTimeout(() => {
            resizePidRef.current = undefined;
            detectSize();
          }, 100);
        });
        resizeObserver.observe(rootElmnt);
        return () => resizeObserver.unobserve(rootElmnt);
      }
    }, []);

    /**
     * If a `scrollEventSource` is specified then a `wheel` event listener is added to it
     * and the scrollable elements are scrolled based on the event's deltaX and deltaY.
     */
    useEffect(() => {
      if (scrollEventSource) {
        console.log('ADDING');
        const sourceElmnt = scrollEventSource;
        const onWheel = (event: WheelEvent) => {
          performance.mark('wheel');
          gridLayoutRef.current.moveWindowBy(event.deltaX, event.deltaY);
        };
        sourceElmnt.addEventListener('wheel', onWheel);
        return () => sourceElmnt.removeEventListener('wheel', onWheel);
      }
    }, [scrollEventSource]);

    /**
     * Handle cell events
     * ==================
     * Event listeners are not added to the actual cell elements because they
     * come and go quickly with scrolling. So, to avoid constantly adding and
     * removing listeners, the root element is used instead. The `event.target`
     * is used to determine the correct cell-related ancestor element by climbing
     * the DOM heirarchy. However, this doesn't work for `mouseenter` and
     * `mouseleave` because those events don't affect descendents. Instead,
     * `mouseover` is used because it does work on descendent elements. Since
     * a cell may contain an abribtrarily deep DOM structure, consecutive events
     * are likely to be triggered from within the same cell element. These are
     * filtered out by keeping track of the "current" hovered cell, and only
     * invoking the handler when it changes. Finally, `mouseleave` is observed
     * on the root element which, when fired, will result in a `mouseleave`
     * hanlder invokation on the "current" hovered cell.
     */
    const currentHoverCell = useRef<Cell>();
    useEffect(() => {
      const rootElmnt = rootElmntRef.current;
      if (onCellEvent && rootElmnt) {
        const types = new Set<EventType>(
          cellEventTypes.includes('mouseenter') || cellEventTypes.includes('mouseleave')
            ? [...cellEventTypes, 'mouseover', 'mouseleave']
            : cellEventTypes,
        );

        const handler = (event: Event) => {
          const cell = cellFromEvent(event, rows, `${scrollerId}-cells`);
          if (cell && types.has(event.type as EventType)) {
            if (
              (types.has('mouseenter') || types.has('mouseleave')) &&
              event.type === 'mouseover' &&
              !sameCell(cell, currentHoverCell.current)
            ) {
              if (currentHoverCell.current && cellEventTypes.includes('mouseleave')) {
                onCellEvent('mouseleave', currentHoverCell.current, event);
              }
              if (cell && cellEventTypes.includes('mouseenter')) {
                onCellEvent('mouseenter', cell, event);
              }
              currentHoverCell.current = cell;
            }

            if (cellEventTypes.includes(event.type as EventType)) {
              onCellEvent(event.type as EventType, cell, event);
            }
          } else if (
            currentHoverCell.current &&
            event.type === 'mouseleave' &&
            (event.target as Element).id === scrollerId
          ) {
            if (cellEventTypes.includes('mouseleave')) {
              onCellEvent('mouseleave', currentHoverCell.current, event);
            }
            currentHoverCell.current = undefined;
          }
        };

        types.forEach(eventType => rootElmnt.addEventListener(eventType, handler));
        return () => types.forEach(eventType => rootElmnt.removeEventListener(eventType, handler));
      }
    }, [cellEventTypes, onCellEvent, rows]);

    /**
     * Row/column heights/widths can be specified as "natural". A row with a natural height
     * will be assigned a "row height override" based on measuring its rendered cell heights
     * and using the maximum. Similar for columns.
     */
    useLayoutEffect(() => {
      let hasNewHeightOverrides = false;
      for (let r = renderFromRow; r < renderToRow && !hasNewHeightOverrides; r += 1) {
        if (rowPositions[r].height === -1 && rowHeightOverrides[r] === undefined) {
          hasNewHeightOverrides = true;
        }
      }
      let hasNewWidthOverrides = false;
      for (let c = renderFromCol; c < renderToCol && !hasNewWidthOverrides; c += 1) {
        if (colPositions[c].width === -1 && colWidthOverrides[c] === undefined) {
          hasNewWidthOverrides = true;
        }
      }

      if (hasNewHeightOverrides) {
        const hOverrides: SizeOverrides = {};
        document.querySelectorAll(`.${scrollerId}-cells > div[data-natural-height-row]`).forEach(cellElmnt => {
          const row = Number(cellElmnt.getAttribute('data-natural-height-row'));
          const { height } = cellElmnt.getBoundingClientRect();
          hOverrides[row] = Math.max(hOverrides[row] || 0, height);
        });
        setRowHeightOverrides(rho => ({ ...rho, ...hOverrides }));
      }

      if (hasNewWidthOverrides) {
        const wOverrides: SizeOverrides = {};
        document.querySelectorAll(`.${scrollerId}-cells > div[data-natural-width-col]`).forEach(cellElmnt => {
          const col = Number(cellElmnt.getAttribute('data-natural-width-col'));
          const { width } = cellElmnt.getBoundingClientRect();
          wOverrides[col] = Math.max(wOverrides[col] || 0, width);
        });
        setColWidthOverrides(cwo => ({ ...cwo, ...wOverrides }));
      }
    });

    const getAltCellSize = (cell: Cell) => {
      const cellSpan = cellSpans.find(({ row, col }) => row === cell.row && col === cell.col);
      if (cellSpan) {
        const { rows, cols } = cellSpan;
        let height = 0;
        for (let r = cell.row; r < cell.row + rows; r += 1) {
          height += rowPositions[r].height;
        }
        let width = 0;
        for (let c = cell.col; c < cell.col + cols; c += 1) {
          width += colPositions[c].width;
        }
        return { width, height };
      }
      return undefined;
    };

    const hiddenCellKeys = useMemo(
      () =>
        cellSpans.reduce((keys, { row, rows, col, cols }) => {
          for (let r = row; r < row + rows; r += 1) {
            for (let c = col; c < col + cols; c += 1) {
              if (c !== col || r !== row) {
                keys.push(`${r}-${c}`);
              }
            }
          }
          return keys;
        }, [] as string[]),
      [cellSpans],
    );

    const draggable = cellEventTypes.includes('dragstart');

    /** Render the actual elements. */
    const cellElmnts: ReactElement[] = [];
    let top = 0;
    for (let r = renderFromRow; r < renderToRow; r += 1) {
      const { height } = rowPositions[r];
      if (!stuckRows[r]) {
        let left = 0;
        for (let c = renderFromCol; c < renderToCol; c += 1) {
          const key = `${r}-${c}`;
          const { width } = colPositions[c];
          if (!stuckCols[c] && !hiddenCellKeys.includes(key)) {
            const cell = { row: r, col: c, data: rows[r][c] };
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;
            cellElmnts.push(
              <CellElement
                key={key}
                className={className}
                row={r}
                col={c}
                left={left}
                top={top}
                width={altSize.width || width}
                height={altSize.height || height}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </CellElement>,
            );
          }
          left += width;
        }
      }
      top += height;
    }

    const stuckRowCellElmnts: ReactElement[] = [];
    let stuckRowsHeight = 0;
    Object.entries(stuckRows).forEach(([row, pos]) => {
      const r = Number(row);
      let left = 0;
      for (let c = renderFromCol; c < renderToCol; c += 1) {
        const key = `${r}-${c}`;
        const { width } = colPositions[c];
        if (!stuckCols[c] && !hiddenCellKeys.includes(key)) {
          const cell = { row: r, col: c, data: rows[r][c] };
          const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
          const className = cellClassName ? cellClassName(cell) : undefined;
          stuckRowCellElmnts.push(
            <CellElement
              key={key}
              className={className}
              row={r}
              col={c}
              left={left}
              top={pos.y}
              width={altSize.width || width}
              height={altSize.height || pos.height}
              draggable={draggable}
            >
              {renderCell(cell.data, cell)}
            </CellElement>,
          );
        }
        left += width;
      }
      stuckRowsHeight += pos.height;
    });

    const stuckColCellElmnts: ReactElement[] = [];
    let stuckColsWidth = 0;
    Object.entries(stuckCols).forEach(([col, pos]) => {
      const c = Number(col);
      let top = 0;
      for (let r = renderFromRow; r < renderToRow; r += 1) {
        const { height } = rowPositions[r];
        if (!stuckRows[r]) {
          const key = `${r}-${c}`;
          if (!hiddenCellKeys.includes(key)) {
            const cell = { row: r, col: c, data: rows[r][c] };
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;
            stuckColCellElmnts.push(
              <CellElement
                key={key}
                className={className}
                row={r}
                col={c}
                left={pos.x}
                top={top}
                width={altSize.width || pos.width}
                height={altSize.height || height}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </CellElement>,
            );
          }
        }
        top += height;
      }
      stuckColsWidth += pos.width;
    });

    const stuckCellElmnts: ReactElement[] = [];
    top = 0;
    Object.entries(stuckRows).forEach(([row, rowPos]) => {
      const r = Number(row);
      const { height } = rowPos;
      let left = 0;
      Object.entries(stuckCols).forEach(([col, colPos]) => {
        const c = Number(col);
        const { width } = colPos;
        const cell = { row: r, col: c, data: rows[r][c] };
        const className = cellClassName ? cellClassName(cell) : undefined;
        const key = `${r}-${c}`;
        stuckCellElmnts.push(
          <CellElement
            key={key}
            className={className}
            row={r}
            col={c}
            left={left}
            top={top}
            width={width}
            height={height}
            draggable={draggable}
          >
            {renderCell(cell.data, cell)}
          </CellElement>,
        );
        left += width;
      });
      top += height;
    });

    const cellsElmntWidth =
      renderToCol > 0
        ? colPositions[renderToCol - 1].x + colPositions[renderToCol - 1].width - colPositions[renderFromCol].x
        : 0;
    const cellsElmntHeight =
      renderToRow > 0
        ? rowPositions[renderToRow - 1].y + rowPositions[renderToRow - 1].height - rowPositions[renderFromRow].y
        : 0;

    // TODO: touch events

    const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
      performance.mark('wheel');
      gridLayoutRef.current.moveWindowBy(event.deltaX, event.deltaY);
    }, []);

    return (
      <Root
        ref={rootElmntRef}
        id={scrollerId}
        style={style}
        className={className}
        onWheel={scrollEventSource ? undefined : onWheel}
      >
        <Cells ref={cellsElmntRef} className={`${scrollerId}-cells`}>
          {cellElmnts}
        </Cells>
        {stuckRowCellElmnts.length > 0 && (
          <StuckRowCells
            ref={stuckRowCellsElmntRef}
            className={`${scrollerId}-cells`}
            style={{ height: px(stuckRowsHeight), width: px(cellsElmntWidth) }}
          >
            {stuckRowCellElmnts}
          </StuckRowCells>
        )}
        {stuckColCellElmnts.length > 0 && (
          <StuckColCells
            ref={stuckColCellsElmntRef}
            className={`${scrollerId}-cells`}
            style={{ width: px(stuckColsWidth), height: px(cellsElmntHeight) }}
          >
            {stuckColCellElmnts}
          </StuckColCells>
        )}
        {stuckCellElmnts.length > 0 && (
          <StuckCells
            className={`${scrollerId}-cells`}
            style={{ height: px(stuckRowsHeight), width: px(stuckColsWidth) }}
          >
            {stuckCellElmnts}
          </StuckCells>
        )}
      </Root>
    );
  },
);

const Root = styled.div`
  position: relative;
  overflow: hidden;
`;

const Cells = styled.div`
  position: relative;
  will-change: transform;
`;

const StuckRowCells = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
  background: inherit;
`;

const StuckColCells = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
  background: inherit;
`;

const StuckCells = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  background: inherit;
`;

const CellRoot = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
`;

const CellElement: FC<{
  className?: string;
  row: number;
  col: number;
  top: number;
  left: number;
  width: number;
  height: number;
  draggable: boolean;
  children: ReactNode;
}> = ({ className, row, col, top, left, width, height, draggable, children }) => (
  <CellRoot
    className={[`r${row}`, `c${col}`, className].filter(Boolean).join(' ')}
    draggable={draggable || undefined}
    data-natural-height-row={height === -1 ? row : undefined}
    data-natural-width-col={width === -1 ? col : undefined}
    style={{
      top: px(top),
      left: px(left),
      width: px(width),
      height: px(height),
    }}
  >
    {children}
  </CellRoot>
);

const to2d = (rows: Array<unknown | unknown[]>): unknown[][] =>
  rows.map(row => (row instanceof Array ? (row as unknown[]) : [row]));

const px = (size: number) => (size === 0 ? 0 : `${size}px`);

const calculateSizes = (itemSize: ItemSize, count: number, maxSize: number, sizeOverrides: SizeOverrides): number[] => {
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
        sizeOverrides[i] || s === 'natural' ? -1 : typeof s === 'number' ? s : s.flex * remainderPerFlex,
      );
    } else {
      return sizes.map((s, i) => sizeOverrides[i] || (s === 'natural' ? -1 : typeof s === 'number' ? s : s.min));
    }
  }
};

const sameCell = (c1?: Cell, c2?: Cell) => c1 && c2 && c1.col === c2.col && c1.row === c2.row;

const cellFromEvent = (event: Event, rows: unknown[][], cellsClassName: string): Cell | undefined => {
  let cellElmnt = event.target as HTMLElement | null;
  while (cellElmnt) {
    const parentElement = cellElmnt.parentElement;
    if (parentElement?.className.split(' ').includes(cellsClassName)) {
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
    return row === -1 || col === -1 ? undefined : { row, col, data: rows[row][col] };
  }
};

window.addEventListener('keypress', event => {
  if (event.key === 'p') {
    printStats('wheel');
    printStats('render');
    printStats('update');
    performance.clearMarks();
  }
});

const printStats = (name: string) => {
  const entries = [...performance.getEntriesByName(name)];
  let minInterval = Number.MAX_VALUE;
  for (let i = 1; i < entries.length; i++) {
    const interval = entries[i].startTime - entries[i - 1].startTime;
    minInterval = Math.min(minInterval, interval);
  }
  console.log('minInterval', name, minInterval);
};
