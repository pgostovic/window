import React, {
  CSSProperties,
  FC,
  forwardRef,
  KeyboardEvent,
  Profiler,
  ProfilerProps,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import styled from 'styled-components';

import FixedMargin, { FixedMarginProps } from './FixedMargin';
import GridCell, { gridCellClassName } from './GridCell';
import GridLayout, { ItemSize, SizeOverrides, WindowCellsRect, WindowPxRect } from './GridLayout';
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

const EventPropsByType = {
  click: 'onClick',
  contextmenu: 'onContextMenu',
  dblclick: 'onDoubleClick',
  drag: 'onDrag',
  dragend: 'onDragEnd',
  dragenter: 'onDragEnter',
  dragexit: 'onDragExit',
  dragleave: 'onDragLeave',
  dragover: 'onDragOver',
  dragstart: 'onDragStart',
  drop: 'onDrop',
  mousedown: 'onMouseDown',
  mouseenter: 'onMouseEnter',
  mouseleave: 'onMouseLeave',
  mousemove: 'onMouseMove',
  mouseout: 'onMouseOut',
  mouseover: 'onMouseOver',
  mouseup: 'onMouseUp',
};

export type EventType = keyof typeof EventPropsByType;

export interface CellSpan {
  row: number;
  col: number;
  rows: number | 'window';
  cols: number | 'window';
}

export interface Cell {
  row: number;
  col: number;
  data: unknown;
}

interface TouchInfo {
  t: number;
  x: number;
  dx: number;
  y: number;
  dy: number;
  pid?: number;
}

interface MayScrollProps extends WindowPxRect {
  deltaX: number;
  deltaY: number;
}

interface Props {
  rows: unknown[][] | unknown[];
  rowHeight?: ItemSize;
  colWidth?: ItemSize;
  stickyRows?: number[];
  stickyCols?: number[];
  /** Rows that will only scroll vertically. */
  vRows?: number[];
  /** Columns that will only scroll horizontally. */
  hCols?: number[];
  cellSpans?: CellSpan[];
  fixedMargin?: FixedMarginProps;
  overlay?: ReactNode;
  initPosition?: { row: number; col: number };
  initScrollPosition?: { left: number; top: number };
  arrowScrollAmount?: number | { x: number; y: number };
  allowDiagnonal?: boolean;
  scrollSpeed?: number;
  cellEventTypes?: EventType[];
  onCellEvent?(type: EventType, cell: Cell, event: Event): void;
  scrollEventSource?: HTMLElement;
  scrollbarContainer?: HTMLElement;
  onScroll?(position: { left: number; top: number; maxLeft: number; maxTop: number }): void;
  mayScroll?: boolean | ((props: MayScrollProps) => boolean);
  cellClassName?(cell: Cell): string;
  mayTabToCell?(cell: Pick<Cell, 'row' | 'col'>): boolean;
  logPerfStats?: boolean;
  children?(data: unknown, cell: Cell): ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const GridScroller = forwardRef<ScrollerRef, Props>(
  (
    {
      rows: rowsRaw,
      rowHeight = DEFAULT_ROW_HEIGHT,
      colWidth = DEFAULT_COL_WIDTH,
      stickyRows = [],
      stickyCols = [],
      vRows: vRowsRaw = [],
      hCols: hColsRaw = [],
      cellSpans = [],
      fixedMargin,
      overlay,
      initPosition,
      cellEventTypes = [],
      onCellEvent,
      initScrollPosition = { left: 0, top: 0 },
      arrowScrollAmount,
      allowDiagnonal = false,
      scrollSpeed = 1,
      scrollEventSource,
      scrollbarContainer,
      onScroll,
      mayScroll = true,
      cellClassName,
      mayTabToCell,
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
    const vRowElmntsRef = useRef<[number, HTMLElement][]>([]);
    const hColElmntsRef = useRef<[number, HTMLElement][]>([]);
    const touchInfoRef = useRef<TouchInfo>({ t: 0, x: 0, dx: 0, y: 0, dy: 0 });
    const vScrollBarRef = useRef<ScrollBarRef>(null);
    const hScrollBarRef = useRef<ScrollBarRef>(null);
    const cellToFocusRef = useRef<Cell>();
    const isMounted = useRef(false);
    const rowsRef = useRef<unknown[][]>();

    // State
    const [, render] = useState(false);

    useEffect(() => {
      isMounted.current = true;
      return () => {
        isMounted.current = false;
      };
    }, []);

    /** Convert to 2d array if rows were supplied as a 1d array. */
    const rows = useMemo(() => to2d(rowsRaw), [rowsRaw]);
    const rowsChanged = rowsRef.current !== rows;
    rowsRef.current = rows;

    const vRows = [...vRowsRaw.sort((a, b) => b - a)];
    const hCols = [...hColsRaw.sort((a, b) => b - a)];

    /** Unique id for this scroller. */
    const scrollerId = useMemo(() => scrollerIdIter.next().value as string, []);

    /** Number of rows of data. */
    const numRows = rows.length;

    /** Number of columns of data. */
    const numCols = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 0), [rows]);

    /**
     * TODO: maybe memoize position calcs. Seems pretty fast, like <0.5ms for both calcs
     * on 1000x1000 grid.
     */

    /** Row positions -- height and y location of each row. */
    const rowPositions = gridLayoutRef.current.calculateRowPositions(rowHeight, numRows);

    /** Col positions -- width and x location of each column. */
    const colPositions = gridLayoutRef.current.calculateColPositions(colWidth, numCols);

    /**
     * Row/column heights/widths can be specified as "natural". A row with a natural height
     * will be assigned a "row height override" based on measuring its rendered cell heights
     * and using the maximum. Similar for columns.
     */
    const naturalHeightRows = useMemo(() => getNaturals(rowHeight, numRows), [rowHeight, numRows]);
    const naturalWidthCols = useMemo(() => getNaturals(colWidth, numCols), [colWidth, numCols]);

    /**
     * After each render, observe the cell elements with 'natural' size with a ResizeObserver.
     */
    useEffect(() => {
      const resizeObserver = new ResizeObserver(entries => {
        const rowHeightOverrides: SizeOverrides = {};
        const colWidthOverrides: SizeOverrides = {};
        entries.forEach(entry => {
          if (entry.target.isConnected) {
            const cell = getCellFromElement(entry.target.parentElement);
            if (cell) {
              if (naturalHeightRows.includes(cell.row)) {
                rowHeightOverrides[cell.row] = Math.max(rowHeightOverrides[cell.row] || 0, entry.contentRect.height);
              }
              if (naturalWidthCols.includes(cell.col)) {
                colWidthOverrides[cell.col] = Math.max(colWidthOverrides[cell.col] || 0, entry.contentRect.width);
              }
            }
          }
        });
        gridLayoutRef.current.applyRowHeightOverrides(rowHeightOverrides);
        gridLayoutRef.current.applyColWidthOverrides(colWidthOverrides);
      });

      naturalHeightRows.forEach(naturalHeightRow => {
        rootElmntRef.current?.querySelectorAll(`div.r${naturalHeightRow} > *`).forEach(cellElmnt => {
          resizeObserver.observe(cellElmnt);
        });
      });

      naturalWidthCols.forEach(naturalWidthCol => {
        rootElmntRef.current?.querySelectorAll(`div.c${naturalWidthCol} > *`).forEach(cellElmnt => {
          resizeObserver.observe(cellElmnt);
        });
      });

      return () => resizeObserver.disconnect();
    });

    const isVerticallyScrollable = gridLayoutRef.current.getScrollability().vertical;
    const isHorizontallyScrollable = gridLayoutRef.current.getScrollability().horizontal;

    /** Configure the GridLayout instance with prop values. */
    gridLayoutRef.current.allowDiagnonal = allowDiagnonal;
    gridLayoutRef.current.setStickyRows(stickyRows);
    gridLayoutRef.current.setStickyCols(stickyCols);

    /** Sync up the list of elements that only scroll vertically. */
    const updateVRowElmnts = () => {
      vRowElmntsRef.current = vRows.reduce(
        (elmnts, r) =>
          elmnts.concat(Array.prototype.slice.call(document.querySelectorAll(`.r${r}`)).map(elmnt => [r, elmnt])),
        [] as [number, HTMLElement][],
      );
    };

    /** Sync up the list of elements that only scroll horizontally. */
    const updateHColElmnts = () => {
      hColElmntsRef.current = hCols.reduce(
        (elmnts, c) =>
          elmnts.concat(Array.prototype.slice.call(document.querySelectorAll(`.c${c}`)).map(elmnt => [c, elmnt])),
        [] as [number, HTMLElement][],
      );
    };

    useEffect(() => {
      updateVRowElmnts();
      updateHColElmnts();
    });

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

      if (stuckRows) {
        updateVRowElmnts();
      }

      vRowElmntsRef.current.forEach(([r, vRowCellElmnt]) => {
        const translateY = gridLayoutRef.current.getStuckRows()[r] ? 0 : translate.y;
        vRowCellElmnt.style.transform = `translateY(${translateY}px)`;
      });

      if (stuckCols) {
        updateHColElmnts();
      }

      hColElmntsRef.current.forEach(([c, hColCellElmnt]) => {
        const translateX = gridLayoutRef.current.getStuckCols()[c] ? 0 : translate.x;
        hColCellElmnt.style.transform = `translateX(${translateX}px)`;
      });

      if (cells || stuckCols || stuckRows) {
        schedulerRef.current.throttle('render', force ? 0 : 50, () => {
          if (isMounted.current) {
            render(r => !r);
          }
        });
      }

      const { x: left, y: top, width, height } = gridLayoutRef.current.getWindowRect();
      const gridSize = gridLayoutRef.current.getGridSize();
      const maxLeft = Math.max(0, gridSize.width - width);
      const maxTop = Math.max(0, gridSize.height - height);

      if (onScroll) {
        onScroll({ left, top, maxLeft, maxTop });
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
     * If rows have changed then perform layout calculations immediately but don't notify.
     * This ensures that the current render has the latest calculations instead of waiting
     * for the next render.
     */
    if (rowsChanged) {
      gridLayoutRef.current.refresh(false);
    }

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

    useImperativeHandle(ref, () => scrollerApi, []);

    /**
     * Force a layout refresh when rows change.
     */
    useEffect(() => {
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

          const isScrollingEnabled =
            typeof mayScroll === 'boolean'
              ? mayScroll
              : mayScroll({ ...gridLayoutRef.current.getWindowRect(), deltaX, deltaY });

          if (!isScrollingEnabled) {
            return;
          }

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

          const pid = window.setInterval(() => {
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
          const { deltaX, deltaY } = event;
          const isScrollingEnabled =
            typeof mayScroll === 'boolean'
              ? mayScroll
              : mayScroll({ ...gridLayoutRef.current.getWindowRect(), deltaX, deltaY });

          if (isScrollingEnabled) {
            event.preventDefault();
          }
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
    }, [scrollEventSource, isVerticallyScrollable, isHorizontallyScrollable, scrollSpeed, logPerfStats, mayScroll]);

    useEffect(() => {
      if (cellToFocusRef.current) {
        const cell = cellToFocusRef.current;
        const cellElmnt = document.querySelector(`.r${cell.row}.c${cell.col} [tabIndex]`);
        if (cellElmnt && (cellElmnt as HTMLElement).focus) {
          (cellElmnt as HTMLElement).focus();
        }
      }
    });

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

    const effCellEventTypes = useMemo(
      () =>
        new Set<EventType>(
          cellEventTypes.includes('mouseenter') || cellEventTypes.includes('mouseleave')
            ? [...cellEventTypes, 'mouseover', 'mouseleave']
            : cellEventTypes,
        ),
      [cellEventTypes],
    );

    const handleCellEvent = useCallback(
      (event: Event) => {
        if (!onCellEvent) {
          return;
        }

        const cell = cellFromEvent(event, rows, `${scrollerId}-cells`);
        if (cell && effCellEventTypes.has(event.type as EventType)) {
          if (
            (effCellEventTypes.has('mouseenter') || effCellEventTypes.has('mouseleave')) &&
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
          ((event.target as Element).id === scrollerId ||
            (event.target as Element).matches(HScrollBar.toString()) ||
            (event.target as Element).matches(VScrollBar.toString()))
        ) {
          if (cellEventTypes.includes('mouseleave')) {
            onCellEvent('mouseleave', currentHoverCell.current, event);
          }
          currentHoverCell.current = undefined;
        }
      },
      [rows, onCellEvent, effCellEventTypes],
    );

    const handlerProps = Array.from(effCellEventTypes).reduce(
      (props, type) => ({ ...props, [EventPropsByType[type]]: handleCellEvent }),
      {} as { [key: string]: (event: Event) => void },
    );

    const findNextTabCell = (): Cell | undefined => {
      if (mayTabToCell) {
        const activeCell = getCellFromElement(document.activeElement, rows) || { row: 0, col: 0, data: rows[0][0] };
        let { row, col } = activeCell;
        do {
          col += 1;
          if (col >= numCols) {
            col = 0;
            row += 1;
          }
        } while (!mayTabToCell({ row, col }) && row <= numRows);

        if (row < numRows && col < numCols) {
          return { row, col, data: rows[row][col] };
        }
      }
      return undefined;
    };

    /**
     * Handle keyboard navigation with arrow keys, etc.
     */
    const yScrollAmount = typeof arrowScrollAmount === 'number' ? arrowScrollAmount : arrowScrollAmount?.y || 0;
    const xScrollAmount = typeof arrowScrollAmount === 'number' ? arrowScrollAmount : arrowScrollAmount?.x || 0;
    const keydownHandler = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          const nextCell = findNextTabCell();
          if (nextCell) {
            scrollerApi.scrollTo(nextCell.row, nextCell.col);
            cellToFocusRef.current = nextCell;
          }
        }

        if (event.target === rootElmntRef.current) {
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
        }
      },
      [arrowScrollAmount, mayTabToCell],
    );

    const getAltCellSize = (cell: Cell) => {
      const cellSpan = cellSpans.find(({ row, col }) => row === cell.row && col === cell.col);
      if (cellSpan) {
        const { rows, cols } = cellSpan;
        let height = 0;
        if (rows === 'window') {
          height = gridLayoutRef.current.getWindowRect().height;
        } else {
          for (let r = cell.row; r < cell.row + rows; r += 1) {
            height += rowPositions[r].height;
          }
        }
        let width = 0;
        if (cols === 'window') {
          width = gridLayoutRef.current.getWindowRect().width;
        } else {
          for (let c = cell.col; c < cell.col + cols; c += 1) {
            width += colPositions[c].width;
          }
        }
        return { width, height };
      }
      return undefined;
    };

    const hiddenCellKeys = useMemo(
      () =>
        cellSpans.reduce((keys, { row, rows, col, cols }) => {
          let numRows: number;
          if (rows === 'window') {
            numRows = 0;
            const cellBottom = rowPositions[row].y + gridLayoutRef.current.getWindowRect().height;
            for (let r = row; r < rowPositions.length && rowPositions[r].y < cellBottom; r += 1) {
              numRows += 1;
            }
          } else {
            numRows = rows;
          }
          let numCols: number;
          if (cols === 'window') {
            numCols = 0;
            const cellRight = colPositions[col].x + gridLayoutRef.current.getWindowRect().width;
            for (let c = col; c < colPositions.length && colPositions[c].x < cellRight; c += 1) {
              numCols += 1;
            }
          } else {
            numCols = cols;
          }
          for (let r = row; r < row + numRows; r += 1) {
            for (let c = col; c < col + numCols; c += 1) {
              if (c !== col || r !== row) {
                keys.push(`${r}-${c}`);
              }
            }
          }
          return keys;
        }, [] as string[]),
      [cellSpans, gridLayoutRef.current.getWindowRect().width, gridLayoutRef.current.getWindowRect().height],
    );

    const draggable = cellEventTypes.includes('dragstart');

    /** Render the actual elements. */
    const cellElmnts: ReactElement[] = [];
    for (let r = fromRow; r < toRow; r += 1) {
      if (!stuckRows[r] && !vRows.includes(r)) {
        const { y, height } = rowPositions[r];
        for (let c = fromCol; c < toCol; c += 1) {
          const key = `${r}-${c}`;
          if (!stuckCols[c] && !hCols.includes(c) && !hiddenCellKeys.includes(key)) {
            const { x, width } = colPositions[c];
            const cell = { row: r, col: c, data: rows[r][c] };
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;
            cellElmnts.push(
              <GridCell
                key={key}
                className={className}
                row={r}
                col={c}
                left={x}
                top={y}
                width={altSize.width || width}
                height={altSize.height || height}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </GridCell>,
            );
          }
        }
      }
    }

    /** Render the vertical only scroll elements. */
    const vRowCellElmnts: ReactElement[] = [];
    vRows
      .filter(r => stuckRows[r] || (r >= fromRow && r < toRow))
      .forEach(r => {
        const { y, height } = rowPositions[r];

        const isRowStuck = !!stuckRows[r];
        let stuckY = 0;
        if (isRowStuck) {
          const stuckEntries = Object.entries(stuckRows);
          for (let i = 0; i < stuckEntries.length; i += 1) {
            const [rowStr, pos] = stuckEntries[i];
            const row = Number(rowStr);
            if (row === r) {
              break;
            } else {
              stuckY += pos.height;
            }
          }
        }

        const windowWidth = gridLayoutRef.current.getWindowRect().width;
        for (let c = 0; c < colPositions.length && colPositions[c].x < windowWidth; ) {
          const key = `${r}-${c}`;

          if (!hiddenCellKeys.includes(key)) {
            const { x, width } = colPositions[c];
            const cell = { row: r, col: c, data: rows[r][c] };
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;

            vRowCellElmnts.push(
              <GridCell
                key={key}
                className={[className, 'loose'].filter(Boolean).join(' ')}
                row={r}
                col={c}
                left={x}
                top={isRowStuck ? stuckY : y}
                width={altSize.width || width}
                height={altSize.height || height}
                draggable={draggable}
                zIndex={isRowStuck ? 1 : 0}
              >
                {renderCell(cell.data, cell)}
              </GridCell>,
            );
          }

          const span = cellSpans.find(({ row, col }) => row === r && col === c) || { row: r, col: c, rows: 1, cols: 1 };
          c += span.cols === 'window' ? 1 : span.cols;
        }
      });

    /** Render the horizontal only scroll elements. */
    const hColCellElmnts: ReactElement[] = [];
    hCols
      .filter(c => stuckCols[c] || (c >= fromCol && c < toCol))
      .forEach(c => {
        const { x, width } = colPositions[c];

        const isColStuck = !!stuckCols[c];
        let stuckX = 0;
        if (isColStuck) {
          const stuckEntries = Object.entries(stuckCols);
          for (let i = 0; i < stuckEntries.length; i += 1) {
            const [colStr, pos] = stuckEntries[i];
            const col = Number(colStr);
            if (col === c) {
              break;
            } else {
              stuckX += pos.width;
            }
          }
        }

        const windowHeight = gridLayoutRef.current.getWindowRect().height;
        for (let r = 0; r < rowPositions.length && rowPositions[r].y < windowHeight; ) {
          const key = `${r}-${c}`;
          if (!hiddenCellKeys.includes(key)) {
            const { y, height } = rowPositions[r];
            const cell = { row: r, col: c, data: rows[r][c] };
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;

            hColCellElmnts.push(
              <GridCell
                key={key}
                className={[className, 'loose'].filter(Boolean).join(' ')}
                row={r}
                col={c}
                left={isColStuck ? stuckX : x}
                top={y}
                width={altSize.width || width}
                height={altSize.height || height}
                draggable={draggable}
                zIndex={isColStuck ? 1 : 0}
              >
                {renderCell(cell.data, cell)}
              </GridCell>,
            );
          }
          const span = cellSpans.find(({ row, col }) => row === r && col === c) || { row: r, col: c, rows: 1, cols: 1 };
          r += span.rows === 'window' ? 1 : span.rows;
        }
      });

    const stuckRowCellElmnts: ReactElement[] = [];
    let stuckRowsHeight = 0;
    Object.entries(stuckRows).forEach(([row, pos]) => {
      const r = Number(row);
      if (!vRows.includes(r)) {
        for (let c = fromCol; c < toCol; c += 1) {
          const key = `${r}-${c}`;
          if (!stuckCols[c] && !hiddenCellKeys.includes(key)) {
            const cell = { row: r, col: c, data: rows[r][c] };
            const { x, width } = colPositions[c];
            const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
            const className = cellClassName ? cellClassName(cell) : undefined;
            stuckRowCellElmnts.push(
              <GridCell
                key={key}
                className={className}
                row={r}
                col={c}
                left={x}
                top={pos.y}
                width={altSize.width || width}
                height={altSize.height || pos.height}
                draggable={draggable}
              >
                {renderCell(cell.data, cell)}
              </GridCell>,
            );
          }
        }
      } else {
        stuckRowCellElmnts.push(<div key="blank" />);
      }
      stuckRowsHeight += pos.height;
    });

    const stuckColCellElmnts: ReactElement[] = [];
    let stuckColsWidth = 0;
    Object.entries(stuckCols).forEach(([col, pos]) => {
      const c = Number(col);
      if (!hCols.includes(c)) {
        for (let r = fromRow; r < toRow; r += 1) {
          if (!stuckRows[r] && !vRows.includes(r)) {
            const key = `${r}-${c}`;
            if (!hiddenCellKeys.includes(key)) {
              const { y, height } = rowPositions[r];
              const cell = { row: r, col: c, data: rows[r][c] };
              const altSize = getAltCellSize(cell) || { width: undefined, height: undefined };
              const className = cellClassName ? cellClassName(cell) : undefined;
              stuckColCellElmnts.push(
                <GridCell
                  key={key}
                  className={className}
                  row={r}
                  col={c}
                  left={pos.x}
                  top={y}
                  width={altSize.width || pos.width}
                  height={altSize.height || height}
                  draggable={draggable}
                >
                  {renderCell(cell.data, cell)}
                </GridCell>,
              );
            }
          }
        }
      } else {
        stuckColCellElmnts.push(<div key="blank" />);
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
          <GridCell
            key={key}
            className={className}
            row={r}
            col={c}
            left={x}
            top={y}
            width={width}
            height={height}
            draggable={draggable}
          >
            {renderCell(cell.data, cell)}
          </GridCell>,
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
          <Root
            ref={rootElmntRef}
            id={scrollerId}
            tabIndex={arrowScrollAmount ? 0 : undefined}
            onKeyDown={keydownHandler}
            {...handlerProps}
          >
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

            {hColCellElmnts}

            <StuckCells
              ref={stuckColCellsElmntRef}
              className={`${scrollerId}-cells stickyCols`}
              style={{ width: px(stuckColsWidth), height: px(gridSize.height) }}
            >
              {stuckColCellElmnts}
            </StuckCells>

            {vRowCellElmnts}

            <StuckCells
              ref={stuckRowCellsElmntRef}
              className={`${scrollerId}-cells stickyRows`}
              style={{ height: px(stuckRowsHeight), width: px(gridSize.width) }}
            >
              {stuckRowCellElmnts}
            </StuckCells>
            <StuckCells
              className={`${scrollerId}-cells stickyCells`}
              style={{ height: px(stuckRowsHeight), width: px(stuckColsWidth) }}
            >
              {stuckCellElmnts}
            </StuckCells>
            <VScrollBar
              ref={vScrollBarRef}
              orientation="vertical"
              container={scrollbarContainer}
              top={px(stuckRowsHeight)}
              barSize={gridLayoutRef.current.getWindowRect().height / gridSize.height}
              onScroll={onVScroll}
            />
            <HScrollBar
              ref={hScrollBarRef}
              orientation="horizontal"
              container={scrollbarContainer}
              left={px(stuckColsWidth)}
              barSize={gridLayoutRef.current.getWindowRect().width / gridSize.width}
              onScroll={onHScroll}
            />
          </Root>
          {overlay && <Overlay className="overlay">{overlay}</Overlay>}
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

  &:empty {
    display: none;
  }
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

const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const to2d = (rows: Array<unknown | unknown[]>): unknown[][] => {
  let maxWidth = 0;
  return rows
    .map(row => {
      if (row instanceof Array) {
        maxWidth = Math.max(maxWidth, row.length);
        return row;
      }
      maxWidth = Math.max(maxWidth, 1);
      return [row];
    })
    .map(row => (row.length < maxWidth ? [...row, ...Array(maxWidth - row.length).fill('')] : row));
};

const px = (size: number) => (size === 0 ? 0 : `${size}px`);

/**
 * Returns a list of rows/columns that have 'natural' size.
 */
const getNaturals = (itemSize: ItemSize, num: number): number[] => {
  if (typeof itemSize === 'number') {
    return [];
  }
  const naturals: number[] = [];
  for (let i = 0; i < num; i += 1) {
    if (itemSize(i) === 'natural') {
      naturals.push(i);
    }
  }
  return naturals;
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

const getCellFromElement = (elmnt: Element | null, rows?: unknown[][]): Cell | undefined => {
  const cellCoords = elmnt
    ?.closest(gridCellClassName)
    ?.className.split(/\s+/)
    .reduce(
      (rc, cn) => {
        const m = cn.match(/([rc])(\d+)/);
        if (m && m[1] === 'r') {
          return { ...rc, row: Number(m[2]) };
        } else if (m && m[1] === 'c') {
          return { ...rc, col: Number(m[2]) };
        }
        return rc;
      },
      { row: -1, col: -1 },
    );
  return cellCoords ? { ...cellCoords, data: rows ? rows[cellCoords.row][cellCoords.col] : undefined } : undefined;
};
