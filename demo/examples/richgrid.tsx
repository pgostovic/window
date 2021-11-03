import faker from 'faker';
import React, { FC, memo } from 'react';
import styled from 'styled-components';

import { GridScroller } from '../../src';

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  phone: string;
}

const people: Person[] = [];
for (let i = 0; i < 1000; i += 1) {
  people.push({
    id: i,
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName(),
    email: faker.internet.email(),
    department: faker.commerce.department(),
    phone: faker.phone.phoneNumber(),
  });
}

const peopleArray = people.map(p => [p.email, p.id, p.firstName, p.lastName, p.department, p.phone]);

// const cellStyle = {
//   height: '100%',
//   width: '100%',
//   borderBottom: '1px solid #ccc',
//   display: 'flex',
//   alignItems: 'center',
//   overflow: 'hidden',
//   padding: '0 10px',
// };

const Cell = styled.div`
  height: 100%;
  width: 100%;
  border-bottom: 1px solid #ccc;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0 10px;
`;

export const RichGrid: FC = () => (
  <>
    <GridScroller
      style={{ height: '500px', backgroundColor: '#ddd' }}
      rows={peopleArray}
      stickyRows={[0, 1, 5, 10]}
      stickyCols={[0]}
      colWidth={c => (c === 0 ? { flex: 1, min: 250 } : 130)}
      arrowScrollAmount={50}
    >
      {(data, { col }) => (
        <Cell>
          {col === 0 ? (
            <input type="text" placeholder="Email" defaultValue={data as string} />
          ) : col === 2 ? (
            <Red text={data as string} />
          ) : (
            data
          )}
        </Cell>
      )}
    </GridScroller>
  </>
);

const Red: FC<{ text: string }> = memo(({ text }) => {
  return <div style={{ color: 'red' }}>{text}</div>;
});
