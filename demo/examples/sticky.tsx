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

const P = styled.p`
  width: 300px;
  padding: 20px;
  line-height: 1.5;
`;

const Cell = styled.div`
  height: 100%;
  width: 100%;
  border-bottom: 1px solid #ccc;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0 10px;
`;

export const Sticky: FC = () => (
  <>
    <P>
      Sed non placerat tortor. Integer eget risus ut nunc placerat bibendum vitae sit amet mi. Donec sapien diam,
      pretium id varius sit amet, porttitor in nisl. Sed et ante nec neque ornare porttitor id ac arcu. Nunc consequat,
      mi a aliquam efficitur, mauris libero aliquet lacus, quis tincidunt libero dui sed diam. Nulla quis ante non ex
      tempor commodo. Nunc placerat odio metus, quis consequat mi lobortis eget. Aliquam sit amet lectus eu lacus ornare
      elementum. Aenean ac gravida felis. Sed pulvinar egestas sem ac congue. Nulla facilisi. Proin sit amet ornare
      arcu, eget mollis leo. Ut nec vehicula nunc, id laoreet neque. Pellentesque iaculis luctus risus at ornare.
    </P>
    <GridScroller
      mayScroll={({ y, deltaY }) => {
        const { scrollTop, clientHeight, scrollHeight } = document.documentElement;
        const bottom = scrollHeight - clientHeight - scrollTop;
        return bottom === 0 && (y > 0 || deltaY > 0);
      }}
      scrollEventSource={document.documentElement}
      style={{ height: '95vh', backgroundColor: '#ddd' }}
      rows={peopleArray}
      stickyRows={[0, 1, 5, 10]}
      stickyCols={[0]}
      colWidth={c => (c === 0 ? { flex: 1, min: 250 } : 130)}
    >
      {(data, { col }) => <Cell>{col === 2 ? <Email email={data as string} /> : data}</Cell>}
    </GridScroller>
  </>
);

const Email: FC<{ email: string }> = memo(({ email }) => {
  return <div style={{ color: 'red' }}>{email}</div>;
});
