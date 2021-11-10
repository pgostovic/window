const DEFAULT_EXCESS_RENDER_X = 3;
const DEFAULT_EXCESS_RENDER_Y = 3;

type UpdateHandler = (
  translate: { x: number; y: number },
  update: { cells: boolean; stuckRows: boolean; stuckCols: boolean },
  force: boolean,
) => void;
type StuckCols = { [col: number]: { x: number; width: number } };
type StuckRows = { [row: number]: { y: number; height: number } };
export type WindowCellsRect = { row: number; col: number; numRows: number; numCols: number };
export type WindowPxRect = { x: number; y: number; width: number; height: number };

export interface FlexSize {
  flex: number;
  min: number;
}

export type ItemSize = number | ((index: number) => number | FlexSize | 'natural');

export interface SizeOverrides {
  [key: number]: number;
}

export default class GridLayout {
  private rowPositions: { y: number; height: number }[];
  private colPositions: { x: number; width: number }[];
  private gridPxSize: { width: number; height: number };
  private windowPxRect: WindowPxRect;
  private windowCellsRect: WindowCellsRect;
  private stickyRows: number[];
  private stickyCols: number[];
  private stuckRows: StuckRows;
  private stuckCols: StuckCols;
  private excessRenderX = DEFAULT_EXCESS_RENDER_X;
  private excessRenderY = DEFAULT_EXCESS_RENDER_Y;
  private rowHeightOverrides: SizeOverrides = {};
  private colWidthOverrides: SizeOverrides = {};
  public allowDiagnonal = false;
  public updateHandler: UpdateHandler = () => undefined;

  constructor() {
    this.rowPositions = [];
    this.colPositions = [];
    this.gridPxSize = { width: 0, height: 0 };
    this.windowPxRect = { x: 0, y: 0, width: 0, height: 0 };
    this.windowCellsRect = { row: 0, col: 0, numRows: 0, numCols: 0 };
    this.stickyRows = [];
    this.stickyCols = [];
    this.stuckRows = {};
    this.stuckCols = {};
  }

  getGridSize(): { width: number; height: number } {
    return this.gridPxSize;
  }

  getScrollability(): { vertical: boolean; horizontal: boolean } {
    return {
      vertical: this.gridPxSize.height > this.windowPxRect.height,
      horizontal: this.gridPxSize.width > this.windowPxRect.width,
    };
  }

  setStickyRows(stickyRows: number[]): void {
    this.stickyRows = [...stickyRows].sort((a, b) => a - b);
  }

  setStickyCols(stickyCols: number[]): void {
    this.stickyCols = [...stickyCols].sort((a, b) => a - b);
  }

  getWindowCellsRect(): WindowCellsRect {
    return this.windowCellsRect;
  }

  getStuckRows(): StuckRows {
    return this.stuckRows;
  }

  getStuckCols(): StuckCols {
    return this.stuckCols;
  }

  calculateRowPositions(rowHeight?: ItemSize, numRows?: number): { y: number; height: number }[] {
    this.pruneRowHeightOverrides(rowHeight, numRows);
    const heights =
      rowHeight && typeof numRows === 'number'
        ? calculateSizes(rowHeight, numRows, this.windowPxRect.height, this.rowHeightOverrides)
        : this.rowPositions.map(({ height }, i) => this.rowHeightOverrides[i] || height);

    const rowPositions: { y: number; height: number }[] = [];
    let prev = { y: 0, height: 0 };
    for (let i = 0; i < heights.length; i += 1) {
      const pos = { height: heights[i], y: prev.y + prev.height };
      rowPositions.push(pos);
      prev = pos;
    }
    this.rowPositions = rowPositions;
    this.gridPxSize.height = prev.y + prev.height;

    return this.rowPositions;
  }

  applyRowHeightOverrides(overrides: SizeOverrides): void {
    const hasChanges = Object.entries(overrides).some(([k, v]) => this.rowHeightOverrides[Number(k)] !== v);
    if (hasChanges) {
      this.rowHeightOverrides = { ...this.rowHeightOverrides, ...overrides };
      this.calculateRowPositions();
      this.refresh();
    }
  }

  calculateColPositions(colWidth?: ItemSize, numCols?: number): { x: number; width: number }[] {
    this.pruneColWidthOverrides(colWidth, numCols);
    const widths =
      colWidth && typeof numCols === 'number'
        ? calculateSizes(colWidth, numCols, this.windowPxRect.width, this.colWidthOverrides)
        : this.colPositions.map(({ width }, i) => this.colWidthOverrides[i] || width);

    const colPositions: { x: number; width: number }[] = [];
    let prev = { x: 0, width: 0 };
    for (let i = 0; i < widths.length; i += 1) {
      const pos = { width: widths[i], x: prev.x + prev.width };
      colPositions.push(pos);
      prev = pos;
    }
    this.colPositions = colPositions;
    this.gridPxSize.width = prev.x + prev.width;

    return this.colPositions;
  }

  applyColWidthOverrides(overrides: SizeOverrides): void {
    const hasChanges = Object.entries(overrides).some(([k, v]) => this.colWidthOverrides[Number(k)] !== v);
    if (hasChanges) {
      this.colWidthOverrides = { ...this.colWidthOverrides, ...overrides };
      this.calculateColPositions();
      this.refresh();
    }
  }

  clearSizeOverrides(): void {
    if (Object.keys(this.rowHeightOverrides).length > 0 || Object.keys(this.colWidthOverrides).length > 0) {
      this.rowHeightOverrides = {};
      this.colWidthOverrides = {};
      this.calculateRowPositions();
      this.calculateColPositions();
      this.refresh();
    }
  }

  setWindowSize(width: number, height: number): void {
    if (width !== this.windowPxRect.width || height !== this.windowPxRect.height) {
      this.windowPxRect.width = width;
      this.windowPxRect.height = height;
      this.update(true);
    }
  }

  getWindowRect(): WindowPxRect {
    return this.windowPxRect;
  }

  moveToTop(): void {
    this.moveWindow(this.windowPxRect.x, 0);
  }

  moveToBottom(): void {
    this.moveWindow(this.windowPxRect.x, Math.max(0, this.gridPxSize.height - this.windowPxRect.height));
  }

  moveToLeft(): void {
    this.moveWindow(0, this.windowPxRect.y);
  }

  moveToRight(): void {
    this.moveWindow(Math.max(0, this.gridPxSize.width - this.windowPxRect.width), this.windowPxRect.y);
  }

  pageUp(): void {
    const stuckRowsHeight = Object.values(this.stuckRows).reduce((h, sr) => h + sr.height, 0);
    this.moveWindowBy(0, -(this.windowPxRect.height - stuckRowsHeight));
  }

  pageDown(): void {
    const stuckRowsHeight = Object.values(this.stuckRows).reduce((h, sr) => h + sr.height, 0);
    this.moveWindowBy(0, this.windowPxRect.height - stuckRowsHeight);
  }

  moveWindow(x: number, y: number): void {
    const dx = x - this.windowPxRect.x;
    const dy = y - this.windowPxRect.y;
    this.moveWindowBy(dx, dy);
  }

  moveWindowBy(dx: number, dy: number): void {
    const { width, height } = this.gridPxSize;
    const xgty = Math.abs(dx) > Math.abs(dy);
    let newX = this.windowPxRect.x;
    if (this.allowDiagnonal || xgty) {
      newX = Math.min(Math.max(0, this.windowPxRect.x + dx), width - this.windowPxRect.width);
    }
    let newY = this.windowPxRect.y;
    if (this.allowDiagnonal || !xgty) {
      newY = Math.min(Math.max(0, this.windowPxRect.y + dy), height - this.windowPxRect.height);
    }

    if (newX !== this.windowPxRect.x || newY !== this.windowPxRect.y) {
      this.windowPxRect.x = newX;
      this.windowPxRect.y = newY;
      this.update();
    }
  }

  refresh(notify?: boolean): void {
    this.update(true, notify);
  }

  /**
   * This method computes the following based on the current window position:
   * - windowCellsRect: which cells should be rendered
   * - stuckRows: which of the sticky rows are stuck
   * - stuckCols: which of the sticky cols are stuck
   * - translate: the translation that should be applied
   */
  private update(force = false, notify = true) {
    this.minimizeEmptySpace();

    // Find the row that straddles the top boundary of the window rect.
    let row = Math.min(this.windowCellsRect.row, this.rowPositions.length - 1);
    let numRows = 0;
    let rowPos = this.rowPositions[row];
    const dirY = rowPos && rowPos.y > this.windowPxRect.y ? -1 : 1;
    while (
      rowPos &&
      (rowPos.y > this.windowPxRect.y ||
        rowPos.y + /* rowPos.height could be -1 (natural height) */ Math.max(0, rowPos.height) < this.windowPxRect.y)
    ) {
      row += dirY;
      rowPos = this.rowPositions[row];
    }
    // Apply excess to top.
    row = Math.max(0, row - this.excessRenderY);
    rowPos = this.rowPositions[row];

    // Find the row that straddles the bottom boundary of the window rect.
    const bottom = this.windowPxRect.y + this.windowPxRect.height;
    while (rowPos && rowPos.y < bottom) {
      numRows += 1;
      rowPos = this.rowPositions[row + numRows];
    }
    // Apply excess to bottom.
    const rowsLeft = this.rowPositions.length - row - numRows;
    numRows += Math.min(this.excessRenderY, rowsLeft);
    rowPos = this.rowPositions[row + numRows];

    // Find the col that straddles the left boundary of the window rect.
    let col = Math.min(this.windowCellsRect.col, this.colPositions.length - 1);
    let numCols = 0;
    let colPos = this.colPositions[col];
    const dirX = colPos && colPos.x > this.windowPxRect.x ? -1 : 1;
    while (
      colPos &&
      (colPos.x > this.windowPxRect.x ||
        colPos.x + /* colPos.width could be -1 (natural width) */ Math.max(0, colPos.width) < this.windowPxRect.x)
    ) {
      col += dirX;
      colPos = this.colPositions[col];
    }
    // Apply excess to left.
    col = Math.max(0, col - this.excessRenderX);
    colPos = this.colPositions[col];

    // Find the col that straddles the right boundary of the window rect.
    const right = this.windowPxRect.x + this.windowPxRect.width;
    while (colPos && colPos.x < right) {
      numCols += 1;
      colPos = this.colPositions[col + numCols];
    }
    // Apply excess to right.
    const colsLeft = this.colPositions.length - col - numCols;
    numCols += Math.min(this.excessRenderX, colsLeft);
    colPos = this.colPositions[col + numCols];

    const translate = { x: -this.windowPxRect.x, y: -this.windowPxRect.y };
    const stuckRows = this.computeStuckRows();
    const stuckCols = this.computeStuckCols();
    const cellsRect = { row, col, numRows, numCols };

    const stuckRowsChanged = force || Object.keys(stuckRows).join() !== Object.keys(this.stuckRows).join();
    const stuckColsChanged = force || Object.keys(stuckCols).join() !== Object.keys(this.stuckCols).join();

    const shouldUpdateCellsRect =
      force ||
      Math.abs(cellsRect.row - this.windowCellsRect.row) >= this.excessRenderY ||
      Math.abs(cellsRect.col - this.windowCellsRect.col) >= this.excessRenderX ||
      Math.abs(cellsRect.numRows - this.windowCellsRect.numRows) >= this.excessRenderY ||
      Math.abs(cellsRect.numCols - this.windowCellsRect.numCols) >= this.excessRenderX ||
      /**
       * If the cellsRect has moved to a boundary, the difference may be less than the required excess.
       * So, should update when a boundary is reached.
       */
      this.movedToBoundary(cellsRect);

    if (stuckRowsChanged) {
      this.stuckRows = stuckRows;
    }

    if (stuckColsChanged) {
      this.stuckCols = stuckCols;
    }

    if (shouldUpdateCellsRect) {
      this.windowCellsRect = cellsRect;
    }

    if (notify) {
      this.updateHandler(
        translate,
        {
          cells: shouldUpdateCellsRect,
          stuckRows: stuckRowsChanged,
          stuckCols: stuckColsChanged,
        },
        force,
      );
    }
  }

  /**
   * Tests whether the supplied cellsRect would constitute a move to a boumndary.
   * @param cellsRect the proposed cellsRect.
   * @returns whether the supplied cellsRect would constitute a move to a boumndary.
   */
  private movedToBoundary(cellsRect: WindowCellsRect) {
    return (
      (cellsRect.row === 0 && this.windowCellsRect.row !== 0) ||
      (cellsRect.col === 0 && this.windowCellsRect.col !== 0) ||
      (cellsRect.row + cellsRect.numRows === this.rowPositions.length &&
        this.windowCellsRect.row + this.windowCellsRect.numRows !== this.rowPositions.length) ||
      (cellsRect.col + cellsRect.numCols === this.colPositions.length &&
        this.windowCellsRect.col + this.windowCellsRect.numCols !== this.colPositions.length)
    );
  }

  /**
   * Adjust the window px origin to minimize the amount or empty space that may be the result
   * of a decrease in grid (i.e. data) size.
   */
  private minimizeEmptySpace() {
    const { height, width } = this.gridPxSize;

    if (height < this.windowPxRect.height) {
      this.windowPxRect.y = 0;
    } else {
      this.windowPxRect.y = Math.min(Math.max(0, this.windowPxRect.y), height - this.windowPxRect.height);
    }

    if (width < this.windowPxRect.width) {
      this.windowPxRect.x = 0;
    } else {
      this.windowPxRect.x = Math.min(Math.max(0, this.windowPxRect.x), width - this.windowPxRect.width);
    }
  }

  private computeStuckRows() {
    const stuckRows: StuckRows = {};
    let prev = { y: 0, height: 0 };
    for (let i = 0; i < this.stickyRows.length; i += 1) {
      const row = this.stickyRows[i];
      const y = prev.y + prev.height;
      const rowPos = this.rowPositions[row];
      if (rowPos.y - y < this.windowPxRect.y) {
        const stuckRowPos = { height: rowPos.height, y };
        stuckRows[row] = stuckRowPos;
        prev = stuckRowPos;
      } else {
        break;
      }
    }
    return stuckRows;
  }

  private computeStuckCols() {
    const stuckCols: StuckCols = {};
    let prev = { x: 0, width: 0 };
    for (let i = 0; i < this.stickyCols.length; i += 1) {
      const col = this.stickyCols[i];
      const x = prev.x + prev.width;
      const colPos = this.colPositions[col];
      if (colPos.x - x < this.windowPxRect.x) {
        const stuckColPos = { width: colPos.width, x };
        stuckCols[col] = stuckColPos;
        prev = stuckColPos;
      } else {
        break;
      }
    }
    return stuckCols;
  }

  private pruneRowHeightOverrides(rowHeight?: ItemSize, numRows?: number): void {
    if (typeof rowHeight === 'function' && typeof numRows === 'number') {
      const overriddenRows = Object.keys(this.rowHeightOverrides).map(k => Number(k));
      overriddenRows.forEach(row => {
        if (rowHeight(row) !== 'natural') {
          delete this.rowHeightOverrides[row];
        }
      });
    }
  }

  private pruneColWidthOverrides(colWidth?: ItemSize, numCols?: number): void {
    if (typeof colWidth === 'function' && typeof numCols === 'number') {
      const overriddenCols = Object.keys(this.colWidthOverrides).map(k => Number(k));
      overriddenCols.forEach(col => {
        if (colWidth(col) !== 'natural') {
          delete this.colWidthOverrides[col];
        }
      });
    }
  }
}

/**
 * Returns the actual sizes for the rows/columns, accounting for flex and natural sizes.
 *
 * Flex:
 * -----
 * If the sum of the minimum sizes is less than the total maximum size, then the remainder is distributed
 * among the flex items according to their `flex` value.
 *
 * Natural:
 * --------
 * Items with 'natural' size are replaced by values in the supplied `sizeOverrides`, or 0 if no override
 * exists. Items with 'natural' size will be measured and then added to `sizeOverrides`.
 */
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
