import SupervisorFrame from './SupervisorFrame';

const InsightsLayout = ({ active, title, eyebrow, unreadCount = 0, children }) => (
  <SupervisorFrame active={active} unreadCount={unreadCount}>
    <div className="supervisor-page-heading">
      <div><span className="supervisor-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
    </div>
    {children}
  </SupervisorFrame>
);

export default InsightsLayout;
