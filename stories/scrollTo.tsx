import faker from 'faker';
import React, { FC, useRef, useState } from 'react';

import { Scroller, ScrollerRef } from '../src';

interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

const people: Person[] = [];
for (let i = 0; i < 1000; i++) {
  people.push({
    firstName: faker.name.firstName(),
    lastName: faker.name.lastName(),
    email: faker.internet.email(),
  });
}

export const ScrollToIndex: FC = () => {
  const windowRef = useRef<ScrollerRef>();

  return (
    <div>
      <p>The initScroll prop is set to 50.</p>
      <button onClick={() => windowRef.current.scrollTo(0, 0)}>Scroll to index 0</button>
      <button onClick={() => windowRef.current.scrollTo(100, 0)}>Scroll to index 100</button>
      <button onClick={() => windowRef.current.setOffset({ x: 0, y: 1100 })}>
        Scroll to offset 1100px
      </button>
      <Scroller
        ref={windowRef}
        style={{ height: '500px', width: '200px' }}
        initScroll={{ row: 50, col: 0 }}
        rows={people}
      >
        {(person: Person, i) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            {i} - {person.firstName} {person.lastName}
          </div>
        )}
      </Scroller>
    </div>
  );
};

export const ScrollToItem: FC = () => {
  const windowRef = useRef<ScrollerRef>();
  const [mark, setMark] = useState<Person>();

  return (
    <div>
      <button disabled={!mark} onClick={() => windowRef.current.scrollTo(mark)}>
        Scroll to {mark ? mark.firstName : 'N/A'}
      </button>
      <Scroller ref={windowRef} style={{ height: '500px' }} rows={people}>
        {(person: Person) => (
          <div
            style={{
              borderBottom: '1px solid #ccc',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: person === mark ? '#eee' : undefined,
            }}
          >
            <button style={{ marginRight: '10px' }} onClick={() => setMark(person)}>
              Mark
            </button>
            {person.firstName} {person.lastName} --{' '}
            <a href={`mailto:${person.email}`}>{person.email}</a>
          </div>
        )}
      </Scroller>
    </div>
  );
};
