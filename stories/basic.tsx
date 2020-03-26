import React, { FC } from 'react';
import { FixedSizeList } from 'react-window';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const Basic: FC = () => (
  <div style={{ display: 'flex', flexDirection: 'row' }}>
    <div>
      @phnq/window
      <Scroller style={{ height: '500px', width: '200px' }} items={numbers} renderBatchSize={10}>
        {(num: number) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            {num}
          </div>
        )}
      </Scroller>
    </div>
    <div>
      react-window
      <FixedSizeList itemCount={numbers.length} itemSize={40} width={200} height={500}>
        {({ index, style }) => (
          <div
            style={{
              ...style,
              borderBottom: '1px solid #ccc',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {numbers[index]}
          </div>
        )}
      </FixedSizeList>
    </div>
  </div>
);
