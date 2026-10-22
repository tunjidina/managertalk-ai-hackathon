import React from 'react';
import { render, screen } from '@testing-library/react';

import { Button, Card, Chip, DoorwayMark, Icon, ICON_NAMES, doorwayGap } from './index';

describe('Icon', () => {
  test('every icon renders at least one path', () => {
    ICON_NAMES.forEach((name) => {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
      unmount();
    });
  });

  test('is hidden from assistive technology unless it has a title', () => {
    const { container, rerender } = render(<Icon name="door" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<Icon name="door" title="Open door" />);
    expect(screen.getByRole('img', { name: 'Open door' })).toBeInTheDocument();
  });
});

describe('DoorwayMark', () => {
  test('light widens and never exceeds the frame as openness grows', () => {
    const gaps = [0, 1, 2, 3, 4, 5].map(doorwayGap);
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    }
    expect(doorwayGap(99)).toBe(doorwayGap(5));
    expect(doorwayGap(-3)).toBe(doorwayGap(0));
    expect(doorwayGap(5)).toBeLessThan(24);
  });

  test('is decorative unless titled', () => {
    const { container, rerender } = render(<DoorwayMark />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<DoorwayMark title="ManagerTalk" />);
    expect(screen.getByRole('img', { name: 'ManagerTalk' })).toBeInTheDocument();
  });
});

describe('Button', () => {
  test('is a native button that does not submit forms by default', () => {
    render(<Button>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'button');
  });

  test('can be disabled', () => {
    render(<Button disabled>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('Card', () => {
  test('renders the requested element and children', () => {
    render(
      <Card as="section" voice="tomas" aria-label="Tomás">
        Hello
      </Card>
    );
    expect(screen.getByRole('region', { name: 'Tomás' })).toHaveTextContent('Hello');
  });
});

describe('Chip', () => {
  test('scripted and mock chips never claim a model', () => {
    const { rerender } = render(<Chip kind="scripted" />);
    expect(screen.getByText('Scripted')).toBeInTheDocument();

    rerender(<Chip kind="mock" />);
    expect(screen.getByText('Mock · no AI model called')).toBeInTheDocument();
  });

  test('live chip shows the label it is given', () => {
    render(<Chip kind="live" label="Live · example-model-id" />);
    expect(screen.getByText('Live · example-model-id')).toBeInTheDocument();
  });
});
