import React, {
  CSSProperties,
  FC,
  forwardRef,
  memo,
  Profiler,
  ProfilerProps,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import styled from 'styled-components';

import FixedMargin, { FixedMarginProps } from './FixedMargin';
import GridLayout, { WindowCellsRect } from './GridLayout';
import Scheduler from './Scheduler';
import ScrollBar, { ScrollBarRef } from './ScrollBar';

const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COL_WIDTH = () => ({ flex: 1, min: 80 });

const SCHEDULE_KEY_MOVE_WINDOW = 'movewindow';
const SCHEDULE_KEY_SIZE_WINDOW = 'sizewindow';

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

interface TouchInfo {
  t: number;
  x: number;
  dx: number;
  y: number;
  dy: number;
  pid?: NodeJS.Timeout;
}

interface Props {
  rows: unknown[][] | unknown[];
  rowHeight?: ItemSize;
  colWidth?: ItemSize;
  stickyRows?: number[];
  stickyCols?: number[];
  cellSpans?: CellSpan[];
  fixedMargin?: FixedMarginProps;
  initPosition?: { row: number; col: number };
  initScrollPosition?: { left: number; top: number };
  arrowScrollAmount?: number | { x: number; y: number };
  allowDiagnonal?: boolean;
  scrollSpeed?: number;
  cellEventTypes?: EventType[];
  onCellEvent?(type: EventType, cell: Cell, event: Event): void;
  scrollEventSource?: HTMLElement;
  onScroll?(position: { left: number; top: number; maxLeft: number; maxTop: number }): void;
  cellClassName?(cell: Cell): string;
  logPerfStats?: boolean;
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
      fixedMargin,
      initPosition,
      cellEventTypes = [],
      onCellEvent,
      initScrollPosition = { left: 0, top: 0 },
      arrowScrollAmount,
      allowDiagnonal = false,
      scrollSpeed = 1,
      scrollEventSource,
      onScroll,
      cellClassName,
      logPerfStats = false,
      children: renderCell = data => data as ReactNode,
      style,
      className,
    },
    ref,
  ) => {
    if (logPerfStats) {
      performance.mark('render');
    }

    // Refs
    const schedulerRef = useRef(new Scheduler());
    const gridLayoutRef = useRef<GridLayout>(new GridLayout());
    const rootElmntRef = useRef<HTMLDivElement>(null);
    const cellsElmntRef = useRef<HTMLDivElement>(null);
    const stuckRowCellsElmntRef = useRef<HTMLDivElement>(null);
    const stuckColCellsElmntRef = useRef<HTMLDivElement>(null);
    const touchInfoRef = useRef<TouchInfo>({ t: 0, x: 0, dx: 0, y: 0, dy: 0 });
    const vScrollBarRef = useRef<ScrollBarRef>(null);
    const hScrollBarRef = useRef<ScrollBarRef>(null);

    // State
    const [rowHeightOverrides, setRowHeightOverrides] = useState<SizeOverrides>({});
    const [colWidthOverrides, setColWidthOverrides] = useState<SizeOverrides>({});
    const [, render] = useState(false);

    /** Convert to 2d array if rows were supplied as a 1d array. */
    const rows = useMemo(() => to2d(rowsRaw), [rowsRaw]);

    /** Unique id for this scroller. */
    const scrollerId = useMemo(() => scrollerIdIter.next().value as string, []);

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

    const isVerticallyScrollable = gridLayoutRef.current.getScrollability().vertical;
    const isHorizontallyScrollable = gridLayoutRef.current.getScrollability().horizontal;

    /** Configure the GridLayout instance with prop values. */
    gridLayoutRef.current.allowDiagnonal = allowDiagnonal;
    gridLayoutRef.current.setStickyRows(stickyRows);
    gridLayoutRef.current.setStickyCols(stickyCols);

    /** Assign the updateHandler. */
    gridLayoutRef.current.updateHandler = (translate, { cells, stuckCols, stuckRows }, force) => {
      const cellsElmnt = cellsElmntRef.current;
      const stuckRowCellsElmnt = stuckRowCellsElmntRef.current;
      const stuckColCellsElmnt = stuckColCellsElmntRef.current;

      if (logPerfStats) {
        performance.mark('translate');
      }

      if (cellsElmnt) {
        cellsElmnt.style.transform = `translate(${translate.x}px, ${translate.y}px)`;
      }
      if (stuckRowCellsElmnt) {
        stuckRowCellsElmnt.style.transform = `translateX(${translate.x}px)`;
      }
      if (stuckColCellsElmnt) {
        stuckColCellsElmnt.style.transform = `translateY(${translate.y}px)`;
      }

      if (cells || stuckCols || stuckRows) {
        schedulerRef.current.throttle('render', force ? 0 : 50, () => {
          render(r => !r);
        });
      }

      const { x: left, y: top, width, height } = gridLayoutRef.current.getWindowRect();
      const gridSize = gridLayoutRef.current.getGridSize();
      const maxLeft = Math.max(0, gridSize.width - width);
      const maxTop = Math.max(0, gridSize.height - height);

      if (onScroll) {
        return onScroll({ left, top, maxLeft, maxTop });
      }

      if (vScrollBarRef.current) {
        vScrollBarRef.current.setPosition(top / maxTop);
      }

      if (hScrollBarRef.current) {
        hScrollBarRef.current.setPosition(left / maxLeft);
      }

      if (logPerfStats) {
        schedulerRef.current.debounce('printStats', 1000, () => {
          printStats(renderDurationsRef.current);
          renderDurationsRef.current = [];
        });
      }
    };

    /**
     * Get some GridLayout state for the current render.
     */
    const stuckRows = gridLayoutRef.current.getStuckRows();
    const stuckCols = gridLayoutRef.current.getStuckCols();
    const { fromRow, toRow, fromCol, toCol } = getRenderRange(
      gridLayoutRef.current.getWindowCellsRect(),
      numRows,
      numCols,
    );

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

    useImperativeHandle(ref, () => scrollerApi);

    /**
     * Force a layout refresh when rows change.
     */
    useEffect(() => {
      setRowHeightOverrides({});
      setColWidthOverrides({});
      gridLayoutRef.current.refresh();
    }, [rows]);

    // Detect initial and changes in root element size.
    useEffect(() => {
      const rootElmnt = rootElmntRef.current;
      if (rootElmnt) {
        schedulerRef.current.nextFrame(SCHEDULE_KEY_MOVE_WINDOW, () => {
          if (initPosition) {
            gridLayoutRef.current.moveWindow(colPositions[initPosition.col].x, rowPositions[initPosition.row].y);
          } else {
            gridLayoutRef.current.moveWindow(initScrollPosition.left, initScrollPosition.top);
          }
        });

        const detectSize = () => {
          schedulerRef.current.nextFrame(SCHEDULE_KEY_SIZE_WINDOW, () => {
            const { width, height } = rootElmnt.getBoundingClientRect();
            gridLayoutRef.current.setWindowSize(width, height);
          });
        };

        detectSize();

        const resizeObserver = new ResizeObserver(detectSize);
        resizeObserver.observe(rootElmnt);
        return () => resizeObserver.unobserve(rootElmnt);
      }
    }, []);

    /**
     * Set up listener(s) for scroll events. Desktop uses the `wheel` event. Events come from
     * the rootElmnt by default, but an alternate `scrollEventSource` may be specified instead.
     */
    useEffect(() => {
      const sourceElmnt = scrollEventSource || rootElmntRef.current;
      if (sourceElmnt && (isVerticallyScrollable || isHorizontallyScrollable)) {
        const onWheel = (event: WheelEvent) => {
          const { deltaX, deltaY } = event;
          if (logPerfStats) {
            performance.mark('scroll');
          }
          schedulerRef.current.nextFrame(SCHEDULE_KEY_MOVE_WINDOW, () =>
            gridLayoutRef.current.moveWindowBy(deltaX * scrollSpeed, deltaY * scrollSpeed),
          );
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
          if (logPerfStats) {
            performance.mark('scroll');
          }
          schedulerRef.current.nextFrame(SCHEDULE_KEY_MOVE_WINDOW, () => gridLayoutRef.current.moveWindowBy(dx, dy));
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
            if (logPerfStats) {
              performance.mark('scroll');
            }
            schedulerRef.current.nextFrame(SCHEDULE_KEY_MOVE_WINDOW, () => gridLayoutRef.current.moveWindowBy(dx, dy));
            speedX = speedX * 0.95;
            speedY = speedY * 0.95;
            if (Math.abs(speedX) + Math.abs(speedY) < 0.01) {
              clearInterval(pid);
              touchInfoRef.current.pid = undefined;
            }
          }, 16);

          touchInfoRef.current = { ...touchInfo, pid };
        };

        /**
         * This handler is registered with `passive: false` so that `event.preventDefault()` can
         * be called. This prevents the back/forward swipe navigation from happening.
         */
        const preventBack = (event: WheelEvent) => {
          event.preventDefault();
        };

        sourceElmnt.addEventListener('wheel', onWheel, mayUsePassive ? { passive: true } : false);
        sourceElmnt.addEventListener('wheel', preventBack, mayUsePassive ? { passive: false } : false);
        sourceElmnt.addEventListener('touchstart', onTouchStart, mayUsePassive ? { passive: true } : false);
        sourceElmnt.addEventListener('touchmove', onTouchMove, mayUsePassive ? { passive: true } : false);
        sourceElmnt.addEventListener('touchend', onTouchEnd);
        return () => {
          sourceElmnt.removeEventListener('wheel', onWheel);
          sourceElmnt.removeEventListener('wheel', preventBack);
          sourceElmnt.removeEventListener('touchstart', onTouchStart);
          sourceElmnt.removeEventListener('touchmove', onTouchMove);
          sourceElmnt.removeEventListener('touchend', onTouchEnd);
        };
      }
    }, [scrollEventSource, isVerticallyScrollable, isHorizontallyScrollable, scrollSpeed, logPerfStats]);

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
      for (let r = fromRow; r < toRow && !hasNewHeightOverrides; r += 1) {
        if (rowPositions[r].height === -1 && rowHeightOverrides[r] === undefined) {
          hasNewHeightOverrides = true;
        }
      }
      let hasNewWidthOverrides = false;
      for (let c = fromCol; c < toCol && !hasNewWidthOverrides; c += 1) {
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

    /**
     * Handle keyboard navigation with arrow keys, etc.
     */
    useEffect(() => {
      const rootElmnt = rootElmntRef.current;
      if (arrowScrollAmount && rootElmnt) {
        const yScrollAmount = typeof arrowScrollAmount === 'number' ? arrowScrollAmount : arrowScrollAmount.y;
        const xScrollAmount = typeof arrowScrollAmount === 'number' ? arrowScrollAmount : arrowScrollAmount.x;
        const handleKey = (event: KeyboardEvent) => {
          const gridLayout = gridLayoutRef.current;
          let handled = true;
          switch ([event.key, event.metaKey ? 'Meta' : undefined].filter(Boolean).join(':')) {
            case 'ArrowUp':
              gridLayout.moveWindowBy(0, -yScrollAmount);
              break;
            case 'ArrowDown':
              gridLayout.moveWindowBy(0, yScrollAmount);
              break;
            case 'ArrowLeft':
              gridLayout.moveWindowBy(-xScrollAmount, 0);
              break;
            case 'ArrowRight':
              gridLayout.moveWindowBy(xScrollAmount, 0);
              break;
            case 'PageUp':
              gridLayout.pageUp();
              break;
            case 'PageDown':
            case ' ': // Space
              gridLayout.pageDown();
              break;
            case 'Home':
            case 'ArrowUp:Meta':
              gridLayout.moveToTop();
              break;
            case 'End':
            case 'ArrowDown:Meta':
              gridLayout.moveToBottom();
              break;
            case 'ArrowLeft:Meta':
              gridLayout.moveToLeft();
              break;
            case 'ArrowRight:Meta':
              gridLayout.moveToRight();
              break;
            default:
              handled = false;
          }
          if (handled) {
            event.preventDefault();
          }
        };
        rootElmnt.addEventListener('keydown', handleKey);
        return () => {
          rootElmnt.removeEventListener('keydown', handleKey);
        };
      }
    }, [arrowScrollAmount]);

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
    for (let r = fromRow; r < toRow; r += 1) {
      const { y, height } = rowPositions[r];
      if (!stuckRows[r]) {
        for (let c = fromCol; c < toCol; c += 1) {
          const key = `${r}-${c}`;
          const { x, width } = colPositions[c];
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
                left={x}
                top={y}
                width={altSize.width || width}
                height={altSize.height || height}
                naturalHeightRow={height === -1 ? r : undefined}
                naturalWidthCol={width === -1 ? c : undefined}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </CellElement>,
            );
          }
        }
      }
    }

    const stuckRowCellElmnts: ReactElement[] = [];
    let stuckRowsHeight = 0;
    Object.entries(stuckRows).forEach(([row, pos]) => {
      const r = Number(row);
      for (let c = fromCol; c < toCol; c += 1) {
        const key = `${r}-${c}`;
        const { x, width } = colPositions[c];
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
              left={x}
              top={pos.y}
              width={altSize.width || width}
              height={altSize.height || pos.height}
              naturalHeightRow={pos.height === -1 ? r : undefined}
              naturalWidthCol={width === -1 ? c : undefined}
              draggable={draggable}
            >
              {renderCell(cell.data, cell)}
            </CellElement>,
          );
        }
      }
      stuckRowsHeight += pos.height;
    });

    const stuckColCellElmnts: ReactElement[] = [];
    let stuckColsWidth = 0;
    Object.entries(stuckCols).forEach(([col, pos]) => {
      const c = Number(col);
      for (let r = fromRow; r < toRow; r += 1) {
        const { y, height } = rowPositions[r];
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
                top={y}
                width={altSize.width || pos.width}
                height={altSize.height || height}
                naturalHeightRow={height === -1 ? r : undefined}
                naturalWidthCol={pos.width === -1 ? c : undefined}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </CellElement>,
            );
          }
        }
      }
      stuckColsWidth += pos.width;
    });

    const stuckCellElmnts: ReactElement[] = [];
    Object.entries(stuckRows).forEach(([row, rowPos]) => {
      const r = Number(row);
      const { y, height } = rowPos;
      Object.entries(stuckCols).forEach(([col, colPos]) => {
        const c = Number(col);
        const key = `${r}-${c}`;
        const { x, width } = colPos;
        const cell = { row: r, col: c, data: rows[r][c] };
        const className = cellClassName ? cellClassName(cell) : undefined;
        stuckCellElmnts.push(
          <CellElement
            key={key}
            className={className}
            row={r}
            col={c}
            left={x}
            top={y}
            width={width}
            height={height}
            naturalHeightRow={height === -1 ? r : undefined}
            naturalWidthCol={width === -1 ? c : undefined}
            draggable={draggable}
          >
            {renderCell(cell.data, cell)}
          </CellElement>,
        );
      });
    });

    const gridSize = gridLayoutRef.current.getGridSize();

    const renderDurationsRef = useRef<number[]>([]);

    const onRender = useCallback((_id: string, _phase: 'mount' | 'update', actualDuration: number) => {
      renderDurationsRef.current.push(actualDuration);
    }, []);

    const onVScroll = useCallback((position: number) => {
      const { x, height } = gridLayoutRef.current.getWindowRect();
      const maxY = Math.max(0, gridLayoutRef.current.getGridSize().height - height);
      gridLayoutRef.current.moveWindow(x, position * maxY);
    }, []);

    const onHScroll = useCallback((position: number) => {
      const { y, width } = gridLayoutRef.current.getWindowRect();
      const maxX = Math.max(0, gridLayoutRef.current.getGridSize().width - width);
      gridLayoutRef.current.moveWindow(position * maxX, y);
    }, []);

    return (
      <Prof enabled={logPerfStats} onRender={onRender}>
        <FixedMargin style={style} className={className} {...fixedMargin}>
          <Root ref={rootElmntRef} id={scrollerId} tabIndex={arrowScrollAmount ? 0 : undefined}>
            <Cells
              ref={cellsElmntRef}
              className={`${scrollerId}-cells`}
              style={{
                width: px(gridSize.width),
                height: px(gridSize.height),
              }}
            >
              {cellElmnts}
            </Cells>
            <VScrollBar
              ref={vScrollBarRef}
              orientation="vertical"
              top={px(stuckRowsHeight)}
              barSize={gridLayoutRef.current.getWindowRect().height / gridSize.height}
              onScroll={onVScroll}
            />
            <HScrollBar
              ref={hScrollBarRef}
              orientation="horizontal"
              left={px(stuckColsWidth)}
              barSize={gridLayoutRef.current.getWindowRect().width / gridSize.width}
              onScroll={onHScroll}
            />
            {stuckRowCellElmnts.length > 0 && (
              <StuckCells
                ref={stuckRowCellsElmntRef}
                className={`${scrollerId}-cells stickyRows`}
                style={{ height: px(stuckRowsHeight), width: px(gridSize.width) }}
              >
                {stuckRowCellElmnts}
              </StuckCells>
            )}
            {stuckColCellElmnts.length > 0 && (
              <StuckCells
                ref={stuckColCellsElmntRef}
                className={`${scrollerId}-cells stickyCols`}
                style={{ width: px(stuckColsWidth), height: px(gridSize.height) }}
              >
                {stuckColCellElmnts}
              </StuckCells>
            )}
            {stuckCellElmnts.length > 0 && (
              <StuckCells
                className={`${scrollerId}-cells stickyCells`}
                style={{ height: px(stuckRowsHeight), width: px(stuckColsWidth) }}
              >
                {stuckCellElmnts}
              </StuckCells>
            )}
          </Root>
        </FixedMargin>
      </Prof>
    );
  },
);

const Prof: FC<{ enabled: boolean; onRender: ProfilerProps['onRender'] }> = ({ enabled, onRender, children }) =>
  enabled ? (
    <Profiler onRender={onRender} id="scroller">
      {children}
    </Profiler>
  ) : (
    <>{children}</>
  );

const Root = styled.div`
  position: relative;
  overflow: hidden;
  background: inherit;
  grid-area: scroller; // referenced in FixedMargin.
`;

const Cells = styled.div`
  position: relative;
  will-change: transform;
`;

const StuckCells = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  background: inherit;
  will-change: transform;
`;

const VScrollBar = styled(ScrollBar)`
  position: absolute;
  right: 0;
  bottom: 0;
`;

const HScrollBar = styled(ScrollBar)`
  position: absolute;
  right: 0;
  bottom: 0;
`;

const CellRoot = styled.div`
  position: absolute;
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
  naturalHeightRow?: number;
  naturalWidthCol?: number;
  draggable: boolean;
}> = memo(
  ({ className, row, col, top, left, width, height, naturalHeightRow, naturalWidthCol, draggable, children }) => (
    <CellRoot
      className={[className, `r${row}`, `c${col}`].filter(Boolean).join(' ')}
      draggable={draggable || undefined}
      data-natural-height-row={naturalHeightRow}
      data-natural-width-col={naturalWidthCol}
      style={{
        left: px(left),
        top: px(top),
        width: px(width),
        height: px(height),
      }}
    >
      {children}
    </CellRoot>
  ),
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
      return sizes.map(
        (s, i) => sizeOverrides[i] || (s === 'natural' ? -1 : typeof s === 'number' ? s : s.flex * remainderPerFlex),
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

const mayUsePassive = (() => {
  try {
    let supportsPassive = false;
    const opts = Object.defineProperty({}, 'passive', {
      get(): boolean {
        supportsPassive = true;
        return true;
      },
    });
    const fn = () => {
      return;
    };
    window.addEventListener('testPassive', fn, opts);
    window.removeEventListener('testPassive', fn, opts);
    return supportsPassive;
  } catch (err) {
    return false;
  }
})();

const printStats = (renderDurations: number[]) => {
  console.log('================ PERF STATS ================');
  ['scroll', 'translate', 'render'].forEach(name => console.log('INTERVAL:', name, getStats(name)));

  if (renderDurations.length > 0) {
    renderDurations.sort((a, b) => a - b);
    const min = renderDurations[0];
    const max = renderDurations[renderDurations.length - 1];
    const avg = renderDurations.reduce((s, n) => s + n, 0) / renderDurations.length;
    console.log('PROFILER:', 'render', {
      avg: Number(avg.toFixed(1)),
      min: Number(min.toFixed(1)),
      max: Number(max.toFixed(1)),
      num: renderDurations.length,
    });
  }
};

const getStats = (name: string) => {
  const entries = [...performance.getEntriesByName(name)];
  const numEntries = entries.length;
  let intervals: number[] = [];
  for (let i = 1; i < numEntries; i++) {
    const interval = entries[i].startTime - entries[i - 1].startTime;
    intervals.push(interval);
  }

  performance.clearMarks(name);

  if (intervals.length < 10) {
    return undefined;
  }

  intervals.sort((a, b) => a - b);
  intervals = intervals.slice(0, Math.round(intervals.length / 2));

  const minInterval = intervals[0];
  const maxInterval = intervals[intervals.length - 1];
  const avg = intervals.reduce((s, n) => s + n, 0) / intervals.length;

  return {
    avg: Number(avg.toFixed(1)),
    min: Number(minInterval.toFixed(1)),
    max: Number(maxInterval.toFixed(1)),
    num: numEntries,
  };
};

const getRenderRange = (cellsRect: WindowCellsRect, totalRows: number, totalCols: number) => {
  const { row, col, numRows, numCols } = cellsRect;
  let [fromRow, toRow, fromCol, toCol] = [row, row + numRows, col, col + numCols];
  if (toRow > totalRows) {
    toRow = totalRows;
    fromRow = Math.max(fromRow, toRow - numRows);
  }
  if (toCol > totalCols) {
    toCol = totalCols;
    fromCol = Math.max(fromCol, toCol - numCols);
  }
  return { fromRow, toRow, fromCol, toCol };
};
