import React, { useEffect, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';

import { useNavigationState } from '../store/navigationState';
import { useAuthState } from '../store/authState';
import { loadScenarioState } from '../engine/scenarioState';
import { useActiveScenarioState } from '../store/activeScenarioState';
import LoadingFallback from '../components/LoadingFallback';

type LoadStatus = 'loading' | 'ready' | 'error';

// -----------------------------
// Formatting helpers
// -----------------------------

/**
 * Fixed month names rather than toLocaleDateString: a certificate should
 * read the same on every machine, and the browser locale would otherwise
 * decide whether this says "18 Sep 2026" or "Sept. 18, 2026".
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** DD MMM YYYY — e.g. 18 Sep 2026. */
function formatCertificateDate(date: Date): string {
  const day = date.getDate() < 10 ? '0' + date.getDate() : String(date.getDate());
  return day + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

/**
 * Whose name goes on the certificate, in priority order:
 *
 *   1. Firebase displayName — set by the identity provider, so it is the
 *      most authoritative thing the app knows.
 *   2. certificateName — what the user typed on the profile screen.
 *      Email/password accounts have no displayName at all, which is why
 *      that screen exists.
 *   3. A neutral product fallback.
 *
 * The email local part is deliberately NOT a source any more. It printed
 * a mangled handle on a document people share, and it put an
 * email-derived string on the one screen most likely to be screenshotted.
 */
function resolveDisplayName(
  displayName: string | null | undefined,
  certificateName: string | null | undefined
): string {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }
  if (certificateName && certificateName.trim()) {
    return certificateName.trim();
  }
  return 'ManagerTalk Participant';
}

/** MT-CERT-{userId}-{scenarioId}-{completedAtMs} */
export function buildCertificateId(
  userId: string,
  scenarioId: string,
  completedAtMs: number
): string {
  return 'MT-CERT-' + userId + '-' + scenarioId + '-' + completedAtMs;
}

// -----------------------------
// Print stylesheet
// -----------------------------
//
// Media queries cannot be expressed as inline styles, so the print rules
// live in a scoped <style> block — same pattern LoadingFallback uses for
// its keyframes. Ctrl/Cmd+P produces a clean certificate: no app chrome,
// no buttons, no page background.

const printStyles = `
@media print {
  body { background: #fff !important; }
  header, nav, button { display: none !important; }
  .mt-cert-page { padding: 0 !important; }
  .mt-cert-card {
    border: 1px solid #1a1a1a !important;
    box-shadow: none !important;
    page-break-inside: avoid;
  }
  .mt-cert-actions { display: none !important; }
}
`;

// -----------------------------
// Screen
// -----------------------------

const CertificateScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();
  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;
  const certificateName = useAuthState((state) => state.certificateName);

  // Which scenario this certificate is for. Reading a constant here would
  // have printed MT-S01 on a certificate earned in MT-S02.
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);
  const scenarioTitle = useActiveScenarioState((state) => state.title);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [completedAt, setCompletedAt] = useState<Timestamp | null>(null);

  // Guards React 19 StrictMode's development double-invoke. Refs survive
  // the simulated unmount/remount, so one mount means one read.
  const loadedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      // No signed-in user: AuthGate should make this unreachable, but the
      // screen must still resolve rather than spin forever.
      setStatus('error');
      return;
    }

    if (loadedUidRef.current === uid) {
      return;
    }

    loadedUidRef.current = uid;

    let active = true;
    setStatus('loading');

    // loadScenarioState never throws — it returns a discriminated result —
    // so there is nothing here to catch.
    loadScenarioState(uid, scenarioId).then((result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setStatus('error');
        return;
      }

      setCompletedAt(result.data.completedAt || null);
      setStatus('ready');
    });

    return () => {
      active = false;

      // See the StrictMode note above: release the guard if the read did
      // not finish, so the remount can retry.
      if (loadedUidRef.current === uid) {
        loadedUidRef.current = null;
      }
    };
  }, [uid, scenarioId]);

  // TODO: implement PDF export. The likely route is html2canvas + jsPDF
  // over the .mt-cert-card node, or a server-rendered PDF so the output
  // does not depend on the viewer's browser.
  const handleDownloadPdf = () => {
    // Intentionally empty — placeholder only.
  };

  const handleReturnHome = () => {
    // The selector, not MT-S01's overview: with more than one scenario,
    // "home" is the list, not whichever scenario happens to be first.
    setCurrentScreen('scenario_select');
  };

  if (status === 'loading') {
    return <LoadingFallback message="Preparing your certificate…" />;
  }

  const completedAtMs = completedAt ? completedAt.toMillis() : null;
  const hasCompletion = completedAtMs !== null && uid !== null;

  const recipientName = resolveDisplayName(
    user ? user.displayName : null,
    certificateName
  );

  const certificateId = hasCompletion
    ? buildCertificateId(uid as string, scenarioId, completedAtMs as number)
    : null;

  const completionDate = completedAtMs !== null
    ? formatCertificateDate(new Date(completedAtMs))
    : null;

  return (
    <div className="mt-cert-page" style={styles.page}>
      <style>{printStyles}</style>

      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Certificate</p>
        <h1 style={styles.title}>Scenario Complete</h1>
        <p style={styles.subtitle}>
          A record of the conversation you practised and the standard you met.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Certificate */}
      <section className="mt-cert-card" style={styles.certificate}>
        {/* Brand mark — matches the App.tsx shell */}
        <div style={styles.brand}>
          <span style={styles.brandMark} aria-hidden="true" />
          <span style={styles.brandName}>ManagerTalk</span>
        </div>

        <h2 style={styles.certificateTitle}>Certificate of Completion</h2>

        <p style={styles.presentedTo}>This certifies that</p>
        <p style={styles.recipient}>{recipientName}</p>

        <p style={styles.presentedTo}>has completed the scenario</p>
        <p style={styles.scenarioTitle}>{scenarioTitle}</p>

        {hasCompletion ? (
          <div style={styles.metaRow}>
            <div style={styles.metaBlock}>
              <p style={styles.metaLabel}>Completed</p>
              <p style={styles.metaValue}>{completionDate}</p>
            </div>

            <div style={styles.metaBlock}>
              <p style={styles.metaLabel}>Scenario</p>
              <p style={styles.metaValue}>{scenarioId}</p>
            </div>
          </div>
        ) : (
          <div style={styles.fallbackBox}>
            <p style={styles.fallbackText}>
              Your completion timestamp could not be loaded.
            </p>
          </div>
        )}

        {certificateId && (
          <div style={styles.certificateIdBlock}>
            <p style={styles.metaLabel}>Certificate ID</p>
            <p style={styles.certificateId}>{certificateId}</p>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="mt-cert-actions" style={styles.actions}>
        <p style={styles.actionsHint}>
          Print to PDF from your browser for a copy you can share.
        </p>

        <div style={styles.buttonRow}>
          <button style={styles.secondaryButton} onClick={handleReturnHome}>
            Return to Home
          </button>

          <button style={styles.cta} onClick={handleDownloadPdf}>
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default CertificateScreen;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a'
  },
  header: {
    marginBottom: '28px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '17px',
    color: '#444',
    maxWidth: '68ch',
    margin: 0
  },
  divider: {
    height: '1px',
    backgroundColor: '#e6e6e6',
    margin: '0 0 36px 0'
  },
  certificate: {
    padding: '56px 48px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderTop: '3px solid #0078D4',
    borderRadius: '12px',
    textAlign: 'center'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '40px'
  },
  brandMark: {
    width: '10px',
    height: '10px',
    borderRadius: '3px',
    backgroundColor: '#0078D4'
  },
  brandName: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '-0.01em'
  },
  certificateTitle: {
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    lineHeight: 1.25,
    margin: '0 0 40px 0'
  },
  presentedTo: {
    fontSize: '14px',
    color: '#6b7280',
    letterSpacing: '0.04em',
    margin: '0 0 8px 0'
  },
  recipient: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#1a1a1a',
    margin: '0 0 32px 0'
  },
  scenarioTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#1a1a1a',
    maxWidth: '52ch',
    margin: '0 auto 40px auto'
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '48px',
    paddingTop: '32px',
    borderTop: '1px solid #e6e6e6'
  },
  metaBlock: {
    minWidth: '160px'
  },
  metaLabel: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 6px 0'
  },
  metaValue: {
    fontSize: '17px',
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0
  },
  fallbackBox: {
    backgroundColor: '#fafafa',
    border: '1px dashed #dcdcdc',
    borderRadius: '10px',
    padding: '20px 24px',
    marginTop: '32px'
  },
  fallbackText: {
    fontSize: '15px',
    color: '#6b7280',
    margin: 0
  },
  certificateIdBlock: {
    marginTop: '36px',
    paddingTop: '24px',
    borderTop: '1px solid #f0f0f0'
  },
  certificateId: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
    color: '#444',
    wordBreak: 'break-all',
    margin: 0
  },
  actions: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  actionsHint: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
    maxWidth: '46ch'
  },
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  },
  secondaryButton: {
    padding: '16px 28px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  cta: {
    padding: '16px 28px',
    fontSize: '18px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};
