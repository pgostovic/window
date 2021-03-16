import React, { FC } from 'react';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 100; i++) {
  numbers.push(i);
}

const sizes: number[] = [];
for (let i = 0; i < 1000; i++) {
  sizes.push(20 + Math.round(Math.random() * 50));
}

export const FlexWidth: FC = () => (
  <Scroller style={{ height: '500px' }} rows={numbers} rowHeight={index => sizes[index]}>
    {(num: number, i) => (
      <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>{num}</span>
        <span style={{ fontSize: 'small', color: '#999' }}>{sizes[i]}px</span>
      </div>
    )}
  </Scroller>
);
