import { useParams } from 'react-router';
import { ReportScreen } from '../features/report/ReportScreen';

export default function ReportPage() {
  const { id = '' } = useParams();
  return <ReportScreen id={id} />;
}
