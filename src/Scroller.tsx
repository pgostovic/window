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
} from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import styled from 'styled-components';

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = () => ({ flex: 1, min: 80 });
const DEFAULT_RENDER_BATCH_SIZE = 1;
const DEFAULT_RENDER_THRESHOLD = 1;

const scrollerClassIter = (function* nameGen(): IterableIterator<string> {
  let i = 0;
  while (true) {
    i += 1;
    yield `scr-${i}`;
  }
})();

interface FlexSize {
  flex: number;
  min: number;
}
type ItemSize = number | ((index: number) => number | FlexSize | 'natural');

interface SizeOverrides {
  [key: number]: number;
}

export interface Cell {
  row: number;
  col: number;
  data: unknown;
}

interface CellSpan {
  row: number;
  col: number;
  rows: number;
  cols: number;
}

export interface ScrollerRef {
  scrollTo(cell: unknown): void;
  scrollTo(row: number, column: number): void;
  getScrollPosition(): { left: number; top: number };
  getMaxScrollPosition(): { left: number; top: number };
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
  cellEventTypes?: EventType[];
  onCellEvent?(type: EventType, cell: Cell, event: Event): void;
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
      fixedMarginContent,
      initPosition,
      initScrollPosition = { left: 0, top: 0 },
      cellEventTypes = [],
      onCellEvent,
      renderBatchSize = DEFAULT_RENDER_BATCH_SIZE,
      renderThreshold = DEFAULT_RENDER_THRESHOLD,
      cellClassName,
      children: renderCell = data => data as ReactNode,
      style,
      className,
    },
    r,
  ) => {
    const ref = r as MutableRefObject<ScrollerRef> | undefined;
    const rows = useMemo(() => to2d(rowsRaw), [rowsRaw]);
    const rootElmntRef = createRef<HTMLDivElement>();
    const rootElmntClassName = useMemo(() => scrollerClassIter.next().value as string, []);
    const resizePidRef = useRef<NodeJS.Timeout>();
    const windowSizeRef = useRef({ width: 0, height: 0 });
    const scrollPositionRef = useRef(initScrollPosition);
    const renderWindowRef = useRef({ fromRow: 0, toRow: 0, fromCol: 0, toCol: 0 });
    const stuckRowsRef = useRef<number[]>([]);
    const stuckColsRef = useRef<number[]>([]);
    const [rowHeightOverrides, setRowHeightOverrides] = useState<SizeOverrides>({});
    const [colWidthOverrides, setColWidthOverrides] = useState<SizeOverrides>({});
    const [, render] = useState(false);

    const padding = {
      left: fixedMarginContent?.left?.width || 0,
      right: fixedMarginContent?.right?.width || 0,
      top: fixedMarginContent?.top?.height || 0,
      bottom: fixedMarginContent?.bottom?.height || 0,
    };

    // console.log('RENDER', renderWindowRef.current);
    const getRootElmnt = () => rootElmntRef.current || document.querySelector(`.${rootElmntClassName} `);
    const getCellsElmnt = () => getRootElmnt()?.firstElementChild;

    const numRows = rows.length;
    const numCols = rows.reduce((max, row) => Math.max(max, row.length), 0);

    const scrollerRef: ScrollerRef = {
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
          this.setScrollPosition({ left: colOffsets[col], top: rowOffsets[row] });
        }
      },
      getScrollPosition() {
        return scrollPositionRef.current;
      },
      getMaxScrollPosition() {
        return maxOffset;
      },
      setScrollPosition(scrollPosition) {
        const cellsElmnt = getCellsElmnt();
        if (cellsElmnt) {
          cellsElmnt.scrollTop = scrollPosition.top;
          cellsElmnt.scrollLeft = scrollPosition.left;
          updateOffset();
        }
      },
    };

    if (ref) {
      ref.current = scrollerRef;
    }

    /**
     * Need to memoize these because they're used in `updateOffset` below, which is wrapped in
     * useCallback(). `updateOffset` gets called very frequently.
     * NOTE: `rowHeight` and `colWidth` are not listed as dependencies because they are
     * likely defined as inline props.
     */
    const rowHeights = useMemo(
      () => calculateSizes(rowHeight, numRows, windowSizeRef.current.height, rowHeightOverrides),
      [numRows, windowSizeRef.current.height, rowHeightOverrides],
    );
    const rowOffsets = useMemo(() => calculateOffsets(rowHeights, rowHeightOverrides), [
      rowHeights,
      rowHeightOverrides,
    ]);
    const colWidths = useMemo(() => calculateSizes(colWidth, numCols, windowSizeRef.current.width, colWidthOverrides), [
      numCols,
      windowSizeRef.current.width,
      colWidthOverrides,
    ]);
    const colOffsets = useMemo(() => calculateOffsets(colWidths, colWidthOverrides), [colWidths, colWidthOverrides]);

    const totalSize = {
      width: numCols === 0 ? 0 : colOffsets[numCols - 1] + colWidths[numCols - 1],
      height: numRows === 0 ? 0 : rowOffsets[numRows - 1] + rowHeights[numRows - 1],
    };

    const maxOffset = {
      left: Math.max(0, totalSize.width - windowSizeRef.current.width),
      top: Math.max(0, totalSize.height - windowSizeRef.current.height),
    };

    const sortedStickyRows = useMemo(() => [...stickyRows].sort((a, b) => a - b), [stickyRows]);
    const stickyRowOffsets = useMemo(
      () =>
        calculateOffsets(
          sortedStickyRows.map(r => rowHeights[r]),
          rowHeightOverrides,
        ),
      [sortedStickyRows, rowHeights, rowHeightOverrides],
    );

    const sortedStickyCols = useMemo(() => [...stickyCols].sort((a, b) => a - b), [stickyCols]);
    const stickyColOffsets = useMemo(
      () =>
        calculateOffsets(
          sortedStickyCols.map(c => colWidths[c]),
          colWidthOverrides,
        ),
      [sortedStickyCols, colWidths, colWidthOverrides],
    );

    // Handle sizing of the root element, which is the "window".
    useEffect(() => {
      const cellsElmnt = getCellsElmnt();
      if (cellsElmnt) {
        if (initPosition) {
          cellsElmnt.scrollTop = rowOffsets[initPosition.row];
          cellsElmnt.scrollLeft = colOffsets[initPosition.col];
        } else {
          cellsElmnt.scrollTop = initScrollPosition.top;
          cellsElmnt.scrollLeft = initScrollPosition.left;
        }

        const detectSize = () => {
          const { width, height } = cellsElmnt.getBoundingClientRect();
          if (height !== windowSizeRef.current.height || width !== windowSizeRef.current.width) {
            windowSizeRef.current = { width, height };
            updateOffset(true);
          }
        };

        // Initial detect size on mount.
        detectSize();

        /**
         * Also detect size when the root element is resized. Debounced to 100ms.
         */
        const resizeObserver = new ResizeObserver(() => {
          if (resizePidRef.current) {
            clearTimeout(resizePidRef.current);
          }
          resizePidRef.current = setTimeout(() => {
            detectSize();
          }, 100);
        });
        resizeObserver.observe(cellsElmnt);
        return () => resizeObserver.unobserve(cellsElmnt);
      }
    }, []);

    /**
     * If the `rows` change, then recalulate the renderWindow.
     */
    useEffect(() => {
      updateOffset();
    }, [rows]);

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
      const rootElmnt = getRootElmnt();
      if (onCellEvent && rootElmnt) {
        const types = new Set<EventType>(
          cellEventTypes.includes('mouseenter') || cellEventTypes.includes('mouseleave')
            ? [...cellEventTypes, 'mouseover', 'mouseleave']
            : cellEventTypes,
        );

        const handler = (event: Event) => {
          const cell = cellFromEvent(event, rows, `${rootElmntClassName}-cells`);
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
            (event.target as Element).className.split(/\s+/).includes(rootElmntClassName)
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
      const { fromRow, toRow, fromCol, toCol } = renderWindowRef.current;

      let hasNewHeightOverrides = false;
      for (let r = fromRow; r < toRow && !hasNewHeightOverrides; r += 1) {
        if (rowHeights[r] === -1 && rowHeightOverrides[r] === undefined) {
          hasNewHeightOverrides = true;
        }
      }
      let hasNewWidthOverrides = false;
      for (let c = fromCol; c < toCol && !hasNewWidthOverrides; c += 1) {
        if (colWidths[c] === -1 && colWidthOverrides[c] === undefined) {
          hasNewWidthOverrides = true;
        }
      }

      if (hasNewHeightOverrides) {
        const hOverrides: SizeOverrides = {};
        document.querySelectorAll(`.${rootElmntClassName}-cells > div[data-natural-height-row]`).forEach(cellElmnt => {
          const row = Number(cellElmnt.getAttribute('data-natural-height-row'));
          const { height } = cellElmnt.getBoundingClientRect();
          hOverrides[row] = Math.max(hOverrides[row] || 0, height);
          hasNewHeightOverrides = true;
        });
        setRowHeightOverrides(rho => ({ ...rho, ...hOverrides }));
      }

      if (hasNewWidthOverrides) {
        const wOverrides: SizeOverrides = {};
        document.querySelectorAll(`.${rootElmntClassName}-cells > div[data-natural-width-col]`).forEach(cellElmnt => {
          const col = Number(cellElmnt.getAttribute('data-natural-width-col'));
          const { width } = cellElmnt.getBoundingClientRect();
          wOverrides[col] = Math.max(wOverrides[col] || 0, width);
          hasNewWidthOverrides = true;
        });
        setColWidthOverrides(cwo => ({ ...cwo, ...wOverrides }));
      }
    });

    /**
     * Update Offset
     * -------------
     * The purpose of this function is to determine the current scroll offset of the root element
     * and determine which cells should be rendered.
     */
    const updateOffset = useCallback(
      (forceRender = false) => {
        const cellsElmnt = getCellsElmnt();
        if (cellsElmnt) {
          const { height, width } = windowSizeRef.current;
          const { scrollLeft, scrollTop } = cellsElmnt;
          const scrollBottom = scrollTop + height;
          const scrollRight = scrollLeft + width;
          let { fromRow, toRow, fromCol, toCol } = renderWindowRef.current;

          if (forceRender) {
            fromRow = 0;
            toRow = 0;
            fromCol = 0;
            toCol = 0;
          }

          scrollPositionRef.current = { left: scrollLeft, top: scrollTop };

          /**
           * visibleFromRow, visibleFromCol, visibleToRow, visibleToCol
           * These are the boundaries that indicate which cells should be visible, even partially.
           */
          const visibleFromRow = Math.max(0, rowOffsets.findIndex(rOff => rOff >= scrollTop) - renderThreshold);
          const visibleFromCol = Math.max(0, colOffsets.findIndex(cOff => cOff >= scrollLeft) - renderThreshold);

          let visibleToRow = rowOffsets.findIndex(rOff => rOff >= scrollBottom) + renderThreshold;
          if (visibleToRow === renderThreshold - 1) {
            visibleToRow = numRows;
          }
          let visibleToCol = colOffsets.findIndex(cOff => cOff >= scrollRight) + renderThreshold;
          if (visibleToCol === renderThreshold - 1) {
            visibleToCol = numCols;
          }

          /**
           * Determine if render window needs to change. If the current render window does include
           * all of the cells that should be visible then update the render window and render.
           */
          if (visibleFromRow < fromRow) {
            fromRow = Math.max(0, visibleFromRow - renderBatchSize);
            toRow = Math.min(numRows, visibleToRow);
          }

          if (visibleFromCol < fromCol) {
            fromCol = Math.max(0, visibleFromCol - renderBatchSize);
            toCol = Math.min(numCols, visibleToCol);
          }

          if (visibleToRow > toRow) {
            toRow = Math.min(rowOffsets.length, visibleToRow + renderBatchSize);
            fromRow = visibleFromRow;
          }

          if (visibleToCol > toCol) {
            toCol = Math.min(colOffsets.length, visibleToCol + renderBatchSize);
            fromCol = visibleFromCol;
          }

          /**
           * Determine stuck rows and columns.
           */
          const stuckRows = sortedStickyRows.filter(
            (r, i) => rowOffsets[r] - stickyRowOffsets[i] <= scrollPositionRef.current.top,
          );
          const stuckCols = sortedStickyCols.filter(
            (c, i) => colOffsets[c] - stickyColOffsets[i] <= scrollPositionRef.current.left,
          );

          if (stuckRows.length > 0) {
            const stuckRowsElmnt = cellsElmnt.nextElementSibling as HTMLDivElement;
            stuckRowsElmnt.scrollLeft = scrollLeft;
          }

          if (stuckCols.length > 0) {
            const stuckColsElmnt = cellsElmnt.nextElementSibling?.nextElementSibling as HTMLDivElement;
            stuckColsElmnt.scrollTop = scrollTop;
          }

          /**
           * If the expected render window is different from the current one, then set it and render.
           */
          if (
            forceRender ||
            fromRow !== renderWindowRef.current.fromRow ||
            toRow !== renderWindowRef.current.toRow ||
            fromCol !== renderWindowRef.current.fromCol ||
            toCol !== renderWindowRef.current.toCol ||
            !sameNumbers(stuckRows, stuckRowsRef.current) ||
            !sameNumbers(stuckCols, stuckColsRef.current)
          ) {
            renderWindowRef.current = { fromRow, toRow, fromCol, toCol };
            stuckRowsRef.current = stuckRows;
            stuckColsRef.current = stuckCols;
            render(r => !r);
          }
        }
      },
      [rowOffsets, colOffsets, numRows, numCols, sortedStickyRows],
    );

    /**
     * Make sure the renderWindow boundaries don't exceed the data boundaries. If the `rows` change then
     * the correct renderWindow boundaries will be calculated in `updateOffset()` via an effect. This enforcement
     * is to guard against array bounds errors during render, before the effect call.
     */
    renderWindowRef.current = enforceWindowRange(renderWindowRef.current, numRows, numCols);

    const getCellSize = (cell: Cell) => {
      const { rows, cols } = cellSpans.find(({ row, col }) => row === cell.row && col === cell.col) || {
        rows: 1,
        cols: 1,
      };
      let height = 0;
      for (let r = cell.row; r < cell.row + rows; r += 1) {
        height += rowHeights[r];
      }
      let width = 0;
      for (let c = cell.col; c < cell.col + cols; c += 1) {
        width += colWidths[c];
      }
      return { width, height };
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

    const { fromRow, toRow, fromCol, toCol } = renderWindowRef.current;
    const stuckRowsHeight = stuckRowsRef.current.reduce((h, r) => h + rowHeights[r], 0);
    const stuckColsWidth = stuckColsRef.current.reduce((w, c) => w + colWidths[c], 0);

    const cellElmnts: ReactElement[] = [];
    for (let r = fromRow; r < toRow; r += 1) {
      const isStuckRow = stuckRowsRef.current.includes(r);
      if (!isStuckRow) {
        for (let c = fromCol; c < toCol; c += 1) {
          const isStuckCol = stuckColsRef.current.includes(c);
          const key = `${r}-${c}`;
          if (!isStuckCol && !hiddenCellKeys.includes(key)) {
            const cell = { row: r, col: c, data: rows[r][c] };
            const className = cellClassName ? cellClassName(cell) : undefined;
            const { width, height } = getCellSize(cell);
            cellElmnts.push(
              <CellElement
                key={key}
                className={className}
                draggable={cellEventTypes.includes('dragstart')}
                row={r}
                col={c}
                top={rowOffsets[r] - stuckRowsHeight}
                left={colOffsets[c] - stuckColsWidth}
                height={height}
                width={width}
              >
                {renderCell(cell.data, cell)}
              </CellElement>,
            );
          }
        }
      }
    }

    const stuckRowCellElmnts: ReactElement[] = [];
    const stuckRows = stuckRowsRef.current;
    for (let i = 0; i < stuckRows.length; i += 1) {
      const r = stuckRows[i];
      const top = stickyRowOffsets[sortedStickyRows.indexOf(r)];
      for (let c = fromCol; c < toCol; c += 1) {
        const isStuckCol = stuckColsRef.current.includes(c);
        const key = `${r}-${c}`;
        if (!isStuckCol && !hiddenCellKeys.includes(key)) {
          const cell = { row: r, col: c, data: rows[r][c] };
          const className = cellClassName ? cellClassName(cell) : undefined;
          const { width, height } = getCellSize(cell);
          stuckRowCellElmnts.push(
            <CellElement
              key={key}
              className={className}
              draggable={cellEventTypes.includes('dragstart')}
              row={r}
              col={c}
              top={top}
              left={colOffsets[c] - stuckColsWidth}
              height={height}
              width={width}
            >
              {renderCell(cell.data, cell)}
            </CellElement>,
          );
        }
      }
    }

    const stuckColCellElmnts: ReactElement[] = [];
    const stuckCols = stuckColsRef.current;
    for (let i = 0; i < stuckCols.length; i += 1) {
      const c = stuckCols[i];
      const left = stickyColOffsets[sortedStickyCols.indexOf(c)];
      for (let r = fromRow; r < toRow; r += 1) {
        const isStuckRow = stuckRowsRef.current.includes(r);
        const key = `${r}-${c}`;
        if (!isStuckRow && !hiddenCellKeys.includes(key)) {
          const cell = { row: r, col: c, data: rows[r][c] };
          const className = cellClassName ? cellClassName(cell) : undefined;
          const { width, height } = getCellSize(cell);
          stuckColCellElmnts.push(
            <CellElement
              key={key}
              className={className}
              draggable={cellEventTypes.includes('dragstart')}
              row={r}
              col={c}
              top={rowOffsets[r] - stuckRowsHeight}
              left={left}
              height={height}
              width={width}
            >
              {renderCell(cell.data, cell)}
            </CellElement>,
          );
        }
      }
    }

    const stuckCellElmnts: ReactElement[] = [];
    for (let i = 0; i < stuckRows.length; i += 1) {
      const r = stuckRows[i];
      const top = stickyRowOffsets[sortedStickyRows.indexOf(r)];
      for (let j = 0; j < stuckCols.length; j += 1) {
        const c = stuckCols[j];
        const left = stickyColOffsets[sortedStickyCols.indexOf(c)];
        const key = `${r}-${c}`;
        if (!hiddenCellKeys.includes(key)) {
          const cell = { row: r, col: c, data: rows[r][c] };
          const className = cellClassName ? cellClassName(cell) : undefined;
          const { width, height } = getCellSize(cell);
          stuckCellElmnts.push(
            <CellElement
              key={key}
              className={className}
              draggable={cellEventTypes.includes('dragstart')}
              row={r}
              col={c}
              top={top}
              left={left}
              height={height}
              width={width}
            >
              {renderCell(cell.data, cell)}
            </CellElement>,
          );
        }
      }
    }

    return (
      <Root
        ref={rootElmntRef}
        className={[rootElmntClassName, className].filter(Boolean).join(' ')}
        style={style}
        padding={padding}
        stuckRowsHeight={stuckRowsHeight}
        stuckColsWidth={stuckColsWidth}
      >
        <Cells onScroll={() => updateOffset()}>
          <div
            className={`${rootElmntClassName}-cells`}
            style={{
              position: 'relative',
              width: px(totalSize.width - stuckColsWidth),
              height: px(totalSize.height - stuckRowsHeight),
            }}
          >
            {cellElmnts}
          </div>
        </Cells>
        <StuckRows>
          <div
            className={`${rootElmntClassName}-cells`}
            style={{
              position: 'relative',
              width: px(totalSize.width),
              height: px(stuckRowsHeight),
            }}
          >
            {stuckRowCellElmnts}
          </div>
        </StuckRows>
        <StuckCols>
          <div
            className={`${rootElmntClassName}-cells`}
            style={{
              position: 'relative',
              width: px(stuckColsWidth),
              height: px(totalSize.height),
            }}
          >
            {stuckColCellElmnts}
          </div>
        </StuckCols>
        <StuckCells className={`${rootElmntClassName}-cells`}>{stuckCellElmnts}</StuckCells>
        <FixedTop>{fixedMarginContent?.top?.node}</FixedTop>
        <FixedLeft>{fixedMarginContent?.left?.node}</FixedLeft>
        <FixedRight>{fixedMarginContent?.right?.node}</FixedRight>
        <FixedBottom>{fixedMarginContent?.bottom?.node}</FixedBottom>
      </Root>
    );
  },
);

const Root = styled.div<{
  padding: { left: number; top: number; right: number; bottom: number };
  stuckRowsHeight: number;
  stuckColsWidth: number;
}>`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: ${({ padding }) => px(padding.left)} ${({ stuckColsWidth }) => px(stuckColsWidth)} 1fr ${({
      padding,
    }) => px(padding.right)};
  grid-template-rows: ${({ padding }) => px(padding.top)} ${({ stuckRowsHeight }) => px(stuckRowsHeight)} 1fr ${({
      padding,
    }) => px(padding.bottom)};
  grid-template-areas:
    'fixedTop fixedTop fixedTop fixedTop'
    'fixedLeft stuckCells stuckRows fixedRight'
    'fixedLeft stuckCols cells fixedRight'
    'fixedBottom fixedBottom fixedBottom fixedBottom';
`;

const Cells = styled.div`
  grid-area: cells;
  overflow: auto;
  will-change: transform;
  box-sizing: border-box;
`;

const StuckRows = styled.div`
  grid-area: stuckRows;
  overflow-x: hidden;
  will-change: transform;
`;

const StuckCols = styled.div`
  grid-area: stuckCols;
  overflow-y: hidden;
  will-change: transform;
`;

const StuckCells = styled.div`
  grid-area: stuckCells;
  will-change: transform;
`;

const FixedTop = styled.div`
  grid-area: fixedTop;
`;

const FixedLeft = styled.div`
  grid-area: fixedLeft;
`;

const FixedRight = styled.div`
  grid-area: fixedRight;
`;

const FixedBottom = styled.div`
  grid-area: fixedBottom;
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
  <div
    className={[`r${row}`, `c${col}`, className].filter(Boolean).join(' ')}
    draggable={draggable || undefined}
    data-natural-height-row={height === -1 ? row : undefined}
    data-natural-width-col={width === -1 ? col : undefined}
    style={{
      position: 'absolute',
      boxSizing: 'border-box',
      top: px(top),
      left: px(left),
      width: px(width),
      height: px(height),
    }}
  >
    {children}
  </div>
);

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

const calculateOffsets = (itemSizes: number[], sizeOverrides: SizeOverrides) => {
  const offsets = itemSizes.length === 0 ? [] : [0];
  for (let i = 0; i < itemSizes.length - 1; i++) {
    offsets.push(offsets[i] + (sizeOverrides[i] || itemSizes[i]));
  }
  return offsets;
};

const sameNumbers = (nums1: number[], nums2: number[]) => {
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

const sameCell = (c1?: Cell, c2?: Cell) => c1 && c2 && c1.col === c2.col && c1.row === c2.row;

const to2d = (rows: Array<unknown | unknown[]>): unknown[][] =>
  rows.map(row => (row instanceof Array ? (row as unknown[]) : [row]));

const enforceWindowRange = (
  renderWindow: { fromRow: number; toRow: number; fromCol: number; toCol: number },
  numRows: number,
  numCols: number,
) => ({
  fromRow: Math.min(numRows, Math.max(0, renderWindow.fromRow)),
  toRow: Math.min(numRows, Math.max(0, renderWindow.toRow)),
  fromCol: Math.min(numCols, Math.max(0, renderWindow.fromCol)),
  toCol: Math.min(numCols, Math.max(0, renderWindow.toCol)),
});

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
