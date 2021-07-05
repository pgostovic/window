import React, { FC, memo } from 'react';
import styled from 'styled-components';

const CellRoot = styled.div`
  position: absolute;
  box-sizing: border-box;
`;

const GridCell: FC<{
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
  ({ className, row, col, top, left, width, height, naturalHeightRow, naturalWidthCol, draggable, children }) => {
    const renderedCell = (
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
    );

    return renderedCell;
  },
);

const px = (size: number) => (size === 0 ? 0 : `${size}px`);

export default GridCell;
