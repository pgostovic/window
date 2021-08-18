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
type WindowPxRect = { x: number; y: number; width: number; height: number };

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

  setRowHeights(rowHeights: number[]): void {
    const rowPositions: { y: number; height: number }[] = [];
    let prev = { y: 0, height: 0 };
    for (let i = 0; i < rowHeights.length; i += 1) {
      const pos = { height: rowHeights[i], y: prev.y + prev.height };
      rowPositions.push(pos);
      prev = pos;
    }
    this.rowPositions = rowPositions;
    this.gridPxSize.height = prev.y + prev.height;
  }

  setColWidths(colWidths: number[]): void {
    const colPositions: { x: number; width: number }[] = [];
    let prev = { x: 0, width: 0 };
    for (let i = 0; i < colWidths.length; i += 1) {
      const pos = { width: colWidths[i], x: prev.x + prev.width };
      colPositions.push(pos);
      prev = pos;
    }
    this.colPositions = colPositions;
    this.gridPxSize.width = prev.x + prev.width;
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

  getRowPositions(): { y: number; height: number }[] {
    return this.rowPositions;
  }

  getColPositions(): { x: number; width: number }[] {
    return this.colPositions;
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
      Math.abs(cellsRect.numCols - this.windowCellsRect.numCols) >= this.excessRenderX;

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
}
