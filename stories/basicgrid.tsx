import React, { FC } from 'react';

import { Scroller } from '../src';

const rows: string[][] = [];

for (let r = 0; r < 1000; r++) {
  const row: string[] = [];
  for (let c = 0; c < 1000; c++) {
    row.push(`${c}-${r}`);
  }
  rows.push(row);
}

const theStyle = `
  .spanner {
    background-color: #eee;
  }
`;

export const BasicGrid: FC = () => (
  <>
    <style>{theStyle}</style>
    <Scroller
      style={{ height: '500px' }}
      rows={rows}
      colWidth={c => (c === 3 ? 'natural' : 100)}
      stickyRows={[0, 3, 10]}
      stickyCols={[5, 10, 15]}
      cellSpan={({ row, col }) =>
        row === 20 && col === 20 ? { rows: 3, cols: 3 } : { rows: 1, cols: 1 }
      }
      onCellClick={cell => console.log('CLK', cell)}
    >
      {(cell, { row, col }) =>
        row === 20 && col === 20 ? (
          <div key="spanner" className="spanner">
            {cell}
          </div>
        ) : col === 3 ? (
          <div style={{ whiteSpace: 'nowrap', padding: '0 5px' }}>{cell}</div>
        ) : (
          cell
        )
      }
    </Scroller>
  </>
);
