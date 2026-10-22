import React from 'react';

interface Profile {
  name: string;
  role: string;
  tenure: string;
  working_style: string;
  communication_style: string;
}

interface Props {
  title: string;
  profile: Profile;
}

const ProfileCard: React.FC<Props> = ({ title, profile }) => {
  return (
    <div style={styles.card}>
      <h2 style={styles.title}>{title}</h2>

      <div style={styles.row}>
        <strong>Name:</strong> <span>{profile.name}</span>
      </div>

      <div style={styles.row}>
        <strong>Role:</strong> <span>{profile.role}</span>
      </div>

      <div style={styles.row}>
        <strong>Tenure:</strong> <span>{profile.tenure}</span>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Working Style</h3>
        <p style={styles.text}>{profile.working_style}</p>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Communication Style</h3>
        <p style={styles.text}>{profile.communication_style}</p>
      </div>
    </div>
  );
};

export default ProfileCard;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  card: {
    flex: 1,
    padding: '16px',
    backgroundColor: '#f7f7f7',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '12px',
  },
  row: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '15px',
  },
  section: {
    marginTop: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '6px',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.5,
  },
};
