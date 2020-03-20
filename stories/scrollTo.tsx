import faker from 'faker';
import React, { FC, useRef, useState } from 'react';

import Window, { WindowRef } from '../src';

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
  const windowRef = useRef<WindowRef>();

  return (
    <div>
      <button onClick={() => windowRef.current.scrollToIndex(0)}>Scroll to index 0</button>
      <button onClick={() => windowRef.current.scrollToIndex(100)}>Scroll to index 100</button>
      <Window ref={windowRef} style={{ height: '500px', width: '200px' }} items={people}>
        {(person: Person) => (
          <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
            {person.firstName} {person.lastName}
          </div>
        )}
      </Window>
    </div>
  );
};

export const ScrollToItem: FC = () => {
  const windowRef = useRef<WindowRef>();
  const [mark, setMark] = useState<Person>();

  return (
    <div>
      <button disabled={!mark} onClick={() => windowRef.current.scrollToItem(mark)}>
        Scroll to {mark ? mark.firstName : 'N/A'}
      </button>
      <Window ref={windowRef} style={{ height: '500px' }} items={people}>
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
      </Window>
    </div>
  );
};
