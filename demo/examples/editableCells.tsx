import React, { FC, ReactNode } from 'react';

import { GridScroller } from '../../src';

const theStyle = `
  .theCell {
    border-top: 1px solid #ccc;
    border-left: 1px solid #ccc;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  input {
    width: 100%;
    height: 100%;
  }
`;

const EDITABLES = [10, 20, 30, 40, 50];

const rows: ReactNode[][] = [];

for (let r = 0; r < 1000; r++) {
  const row: ReactNode[] = [];
  for (let c = 0; c < 100; c++) {
    if (EDITABLES.includes(c)) {
      row.push(<input tabIndex={0} type="text" placeholder="Cell" defaultValue={`${c}-${r}`} />);
    } else {
      row.push(`${c}-${r}`);
    }
  }
  rows.push(row);
}

export const EditableCells: FC = () => (
  <>
    <style>{theStyle}</style>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={rows}
      cellClassName={() => 'theCell'}
      mayTabToCell={({ col }) => EDITABLES.includes(col)}
      logPerfStats
    />
  </>
);
