import React from 'react';
import { AbapDiffWorkbench } from './AbapDiffWorkbench.tsx';
import { HeaderPill } from './HeaderPill.tsx';

export const name = 'abap-diff';
export const inject = ['slots'];

const PANEL_ID = 'abap-diff';

function AbapDiffNavIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="1.75" />
      <circle cx="4" cy="12" r="1.75" />
      <circle cx="12" cy="6" r="1.75" />
      <path d="M4 5.75v4.5M12 7.75c0 2.5-2.5 2.75-8 2.75" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any): void {
  const openWorkbench = () => {
    try {
      ctx.get?.('layout')?.selectPanel?.(PANEL_ID);
    } catch (err) {
      console.warn('[dsh-plugin-abap-diff] Failed to open panel:', err);
    }
  };

  ctx.effect(() => {
    return ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: PANEL_ID,
        },
        () => <AbapDiffWorkbench />,
      ),
    );
  }, 'abap-diff: main panel');

  ctx.effect(() => {
    return ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 45,
          label: () => 'ABAP Diff',
        },
        (props: { size?: number }) => <AbapDiffNavIcon size={props?.size ?? 16} />,
      ),
    );
  }, 'abap-diff: sidebar entry');

  ctx.effect(() => {
    return ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'abap-diff-header',
          order: -10,
        },
        () => <HeaderPill onOpenPanel={openWorkbench} />,
      ),
    );
  }, 'abap-diff: header utility');
}
