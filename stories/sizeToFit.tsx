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

export const SizeToFit: FC = () => (
  <>
    <p>
      If you don&apos;t constrain the height of the Scroller, then all items will be rendered and windowing will be
      effectively disabled.
    </p>
    <Scroller style={{ width: '200px' }} rows={numbers} rowHeight={index => sizes[index]}>
      {(num: number, { row }) => (
        <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{num}</span>
          <span style={{ fontSize: 'small', color: '#999' }}>{sizes[row]}px</span>
        </div>
      )}
    </Scroller>
  </>
);
