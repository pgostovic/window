import React, { FC } from 'react';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const Basic: FC = () => (
  <Scroller style={{ height: '500px', width: '200px' }} items={numbers} renderBatchSize={10}>
    {(num: number) => (
      <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
        {num}
      </div>
    )}
  </Scroller>
);
