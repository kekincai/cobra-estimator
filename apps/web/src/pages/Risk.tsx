import { useParams } from 'react-router';
import { RiskScreen } from '../features/risk/RiskScreen';

export default function RiskPage() {
  const { id = '' } = useParams();
  return <RiskScreen id={id} />;
}
