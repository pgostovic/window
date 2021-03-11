import React, { FC, useEffect, useRef } from 'react';

import { Scroller, ScrollerRef } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

const sizes: number[] = [];
for (let i = 0; i < 1000; i++) {
  sizes.push(20 + Math.round(Math.random() * 50));
}

let offset = { x: 0, y: 0 };

export const ItemSizes: FC = () => {
  const windowRef = useRef<ScrollerRef>();

  useEffect(() => {
    return () => {
      offset = windowRef.current.getOffset();
    };
  });
  return (
    <>
      <Scroller
        ref={windowRef}
        style={{ height: '500px', width: '200px' }}
        rows={numbers}
        rowHeight={index => sizes[index]}
        initOffset={offset}
      >
        {(num: number, i) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{num}</span>
            <span style={{ fontSize: 'small', color: '#999' }}>{sizes[i]}px</span>
          </div>
        )}
      </Scroller>
      <p>
        Note: Offset is saved on unmount (via ScrollerRef.getOffset()) and then applied on mount
        (via initOffset prop). If you navigate to another story, then navigate back to this one, the
        scroll offset will be the same.
      </p>
    </>
  );
};
