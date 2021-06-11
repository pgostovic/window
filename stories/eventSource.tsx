import React, { FC } from 'react';

import { Scroller } from '../src';

const numbers: number[] = [];
for (let i = 0; i < 1000; i++) {
  numbers.push(i);
}

export const EventSource: FC = () => (
  <div>
    Scroll with the cursor anywhere in the frame.
    <Scroller
      scrollEventSource={document.documentElement}
      style={{
        height: '500px',
        width: '200px',
        border: '5px solid #eee',
      }}
      rows={numbers}
    >
      {(num: number) => (
        <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>{num}</div>
      )}
    </Scroller>
  </div>
);

// export const EventSource: FC = () => (
//   <div>
//     <p style={{ width: '50%' }}>
//       Aliquam ligula odio, vulputate nec pulvinar sed, venenatis quis ipsum. Aenean vulputate eu urna non placerat.
//       Pellentesque mattis ultricies dolor, et semper augue mollis vitae. Interdum et malesuada fames ac ante ipsum
//       primis in faucibus. Ut luctus congue elit, id interdum velit vulputate eu. Integer et bibendum ex, in viverra
//       ipsum. Quisque nec eleifend neque, a molestie nisi. Donec ac neque in tortor sagittis sollicitudin. Etiam vitae
//       ultricies mauris, a mattis orci. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos
//       himenaeos. In vitae tristique turpis. Quisque quis nibh non dolor placerat egestas. Nam imperdiet ex nec porta
//       euismod. Mauris quis orci augue. Maecenas imperdiet porta velit nec tristique.
//     </p>
//     Scroll with the cursor anywhere in the frame.
//     <Scroller
//       scrollEventSource={document.documentElement}
//       style={{
//         height: '500px',
//         // height: 'calc(100vh - 50px)',
//         width: '200px',
//         border: '5px solid #eee',
//       }}
//       rows={numbers}
//     >
//       {(num: number) => (
//         <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>{num}</div>
//       )}
//     </Scroller>
//   </div>
// );
