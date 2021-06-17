const MIN_UPDATE_INTERVAL_MILLIS = 15;
const DEFAULT_EXCESS_RENDER_X = 0;
const DEFAULT_EXCESS_RENDER_Y = 0;

type UpdateHandler = (changes: {
  translate: { x: number; y: number };
  cellsRect?: WindowCellsRect;
  stuckRows?: StuckRows;
  stuckCols?: StuckCols;
}) => void;
export type StuckRows = { [row: number]: { y: number; height: number } };
export type StuckCols = { [col: number]: { x: number; width: number } };
export type WindowCellsRect = { row: number; col: number; numRows: number; numCols: number };

export default class GridLayout {
  private rowPositions: { y: number; height: number }[];
  private colPositions: { x: number; width: number }[];
  private gridPxSize: { width: number; height: number };
  private windowPxRect: { x: number; y: number; width: number; height: number };
  private windowCellsRect: WindowCellsRect;
  private stickyRows: number[];
  private stickyCols: number[];
  private stuckRows: StuckRows;
  private stuckCols: StuckCols;
  private excessRenderX = DEFAULT_EXCESS_RENDER_X;
  private excessRenderY = DEFAULT_EXCESS_RENDER_Y;
  private lastUpdateTime = 0;
  public updateHandler?: UpdateHandler;

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

  setRowHeights(rowHeights: number[]) {
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

  setColWidths(colWidths: number[]) {
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

  setStickyRows(stickyRows: number[]) {
    this.stickyRows = [...stickyRows].sort((a, b) => a - b);
  }

  setStickyCols(stickyCols: number[]) {
    this.stickyCols = [...stickyCols].sort((a, b) => a - b);
  }

  getRowPositions() {
    return this.rowPositions;
  }

  getColPositions() {
    return this.colPositions;
  }

  setWindowSize(width: number, height: number) {
    this.windowPxRect.width = width;
    this.windowPxRect.height = height;
    this.update(true);
  }

  getWindowRect() {
    return this.windowPxRect;
  }

  moveWindowBy(dx: number, dy: number) {
    this.moveWindow(this.windowPxRect.x + dx, this.windowPxRect.y + dy);
  }

  moveWindow(x: number, y: number) {
    const { width, height } = this.gridPxSize;
    this.windowPxRect.x = Math.min(Math.max(0, x), width - this.windowPxRect.width);
    this.windowPxRect.y = Math.min(Math.max(0, y), height - this.windowPxRect.height);
    this.update();
  }

  /**
   * This update method calculates window postion and what cells to render.
   */
  private update(forceImmediate = false) {
    const now = performance.now();
    /** If this was called less than MIN_UPDATE_INTERVAL_MILLIS ms ago then ignore. */
    if (!forceImmediate && now - this.lastUpdateTime < MIN_UPDATE_INTERVAL_MILLIS) {
      return;
    }
    this.lastUpdateTime = now;

    performance.mark('update');

    // Find the row that straddles the top boundary of the window rect.
    let row = this.windowCellsRect.row;
    let numRows = 0;
    let rowPos = this.rowPositions[row];
    const dirY = rowPos.y > this.windowPxRect.y ? -1 : 1;
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
    const firstRowPos = rowPos;
    while (rowPos && rowPos.y < bottom) {
      numRows += 1;
      rowPos = this.rowPositions[row + numRows];
    }
    // Apply excess to bottom.
    const rowsLeft = this.rowPositions.length - row - numRows;
    numRows += Math.min(this.excessRenderY, rowsLeft);
    rowPos = this.rowPositions[row + numRows];

    // Find the col that straddles the left boundary of the window rect.
    let col = this.windowCellsRect.col;
    let numCols = 0;
    let colPos = this.colPositions[col];
    const dirX = colPos.x > this.windowPxRect.x ? -1 : 1;
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
    const firstColPos = colPos;
    while (colPos && colPos.x < right) {
      numCols += 1;
      colPos = this.colPositions[col + numCols];
    }
    // Apply excess to right.
    const colsLeft = this.colPositions.length - col - numCols;
    numCols += Math.min(this.excessRenderX, colsLeft);
    colPos = this.colPositions[col + numCols];

    const translate = { x: firstColPos.x - this.windowPxRect.x, y: firstRowPos.y - this.windowPxRect.y };

    const cellsRectChanged =
      row !== this.windowCellsRect.row ||
      col !== this.windowCellsRect.col ||
      numRows !== this.windowCellsRect.numRows ||
      numCols !== this.windowCellsRect.numCols;

    this.windowCellsRect = { row, col, numRows, numCols };

    const stuckRows = this.getStuckRows();
    const stuckRowsChanged = Object.keys(stuckRows).join() !== Object.keys(this.stuckRows).join();
    this.stuckRows = stuckRows;

    const stuckCols = this.getStuckCols();
    const stuckColsChanged = Object.keys(stuckCols).join() !== Object.keys(this.stuckCols).join();
    this.stuckCols = stuckCols;

    if (this.updateHandler) {
      this.updateHandler({
        translate,
        cellsRect: cellsRectChanged ? this.windowCellsRect : undefined,
        stuckRows: stuckRowsChanged ? stuckRows : undefined,
        stuckCols: stuckColsChanged ? stuckCols : undefined,
      });
    }
  }

  private getStuckRows() {
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

  private getStuckCols() {
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
