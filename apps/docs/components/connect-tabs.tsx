'use client';

import { parseColor } from '@oaknational/oak-components';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styled from 'styled-components';

export interface ClientTab {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

const TabList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 2px solid ${parseColor('border-neutral')};
`;

const Tab = styled.button`
  min-height: 44px;
  padding: 8px 16px;
  border: none;
  border-bottom: 4px solid transparent;
  background: none;
  color: ${parseColor('text-primary')};
  font: inherit;
  font-size: 1rem;
  cursor: pointer;

  &[aria-selected='true'] {
    font-weight: 700;
    border-bottom-color: ${parseColor('border-primary')};
  }
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;

  &[hidden] {
    display: none;
  }
`;

const KEY_STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

export function ConnectTabs({
  tabs,
  label,
}: {
  readonly tabs: readonly ClientTab[];
  readonly label: string;
}) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = step(selected, tabs.length);
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <TabList role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => {
              setSelected(index);
            }}
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      {tabs.map((tab, index) => (
        <Panel
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          tabIndex={0}
          hidden={index !== selected}
        >
          {tab.content}
        </Panel>
      ))}
    </div>
  );
}
