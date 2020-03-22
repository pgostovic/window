import React, { FC } from 'react';

import { Window } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const Basic: FC = () => (
  <Window style={{ height: '500px', width: '200px' }} items={numbers}>
    {(num: number) => (
      <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
        {num}
      </div>
    )}
  </Window>
);
