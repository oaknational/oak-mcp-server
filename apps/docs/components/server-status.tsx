'use client';

import { OakFlex, OakLink, OakP, parseColor } from '@oaknational/oak-components';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { HEALTH_URL } from './site.ts';

type Status = 'checking' | 'up' | 'unknown';

const ROUTED_HEALTH_PATH = '/mcp/healthz';

const Dot = styled.span<{ $status: Status }>`
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid ${parseColor('border-primary')};
  background: ${(props) =>
    props.$status === 'up' ? parseColor('icon-success')(props) : parseColor('bg-neutral')(props)};
`;

async function checkHealth(): Promise<Status> {
  try {
    const response = await fetch(ROUTED_HEALTH_PATH, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return 'unknown';
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
      ? 'up'
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function ServerStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let live = true;
    void checkHealth().then((result) => {
      if (live) setStatus(result);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <OakFlex role="status" $alignItems="center" $gap="spacing-12">
      <Dot $status={status} aria-hidden="true" />
      <OakP $font="body-1">
        {status === 'checking' && 'Checking the server…'}
        {status === 'up' && 'The server is up. It answered its health check just now.'}
        {status === 'unknown' && (
          <>
            We can&apos;t check the server from this page.{' '}
            <OakLink href={HEALTH_URL}>Open the health check</OakLink> to see its status.
          </>
        )}
      </OakP>
    </OakFlex>
  );
}
