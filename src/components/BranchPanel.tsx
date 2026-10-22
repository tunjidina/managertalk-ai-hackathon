import React from 'react';

interface Props {
  branch: string;
  definition: any; // matches what ConversationFlowScreen passes in
  signalsTitle?: string;
  managerActionsTitle?: string;
}

const BranchPanel: React.FC<Props> = ({
  branch,
  definition,
  signalsTitle = 'Signals',
  managerActionsTitle = 'Recommended Manager Actions',
}) => {
  // Use the definition passed in from the parent
  const branchData = definition;

  if (!branchData) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <p style={styles.eyebrow}>Exploration</p>
          <h2 style={styles.title}>No branch detected yet</h2>
        </div>
        <p style={styles.emptyText}>
          Submit a message to detect the employee’s response branch.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <p style={styles.eyebrow}>Detected Branch</p>
        <h2 style={styles.title}>{formatBranch(branch)}</h2>
      </div>

      <div style={styles.columns}>
        {/* Signals */}
        <div style={styles.column}>
          <h3 style={styles.columnTitle}>{signalsTitle}</h3>
          <ul style={styles.list}>
            {branchData.signals.map((signal: string, index: number) => (
              <li key={index} style={styles.listItem}>
                <span style={styles.markerSignal} aria-hidden="true" />
                <span style={styles.itemText}>{signal}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Manager Actions */}
        <div style={styles.column}>
          <h3 style={styles.columnTitle}>{managerActionsTitle}</h3>
          <ul style={styles.list}>
            {branchData.manager_actions.map((action: string, index: number) => (
              <li key={index} style={styles.listItem}>
                <span style={styles.markerAction} aria-hidden="true" />
                <span style={styles.itemText}>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BranchPanel;

// -----------------------------
// Helpers
// -----------------------------

function formatBranch(branch: string): string {
  return branch
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: '22px 24px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #0078D4',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    lineHeight: 1.6
  },
  header: {
    marginBottom: '20px'
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 6px 0'
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    margin: 0
  },
  emptyText: {
    fontSize: '15px',
    color: '#6b7280',
    margin: 0
  },
  columns: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px'
  },
  column: {
    flex: '1 1 260px',
    minWidth: '240px'
  },
  columnTitle: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  listItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px 0',
    borderTop: '1px solid #ededed'
  },
  markerSignal: {
    flex: '0 0 auto',
    width: '6px',
    height: '6px',
    marginTop: '9px',
    borderRadius: '50%',
    backgroundColor: '#9ca3af'
  },
  markerAction: {
    flex: '0 0 auto',
    width: '6px',
    height: '6px',
    marginTop: '9px',
    borderRadius: '50%',
    backgroundColor: '#0078D4'
  },
  itemText: {
    fontSize: '15px',
    color: '#444'
  }
};