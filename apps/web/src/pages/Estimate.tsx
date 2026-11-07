import { useParams } from 'react-router';
import { EstimateScreen } from '../features/estimate/EstimateScreen';

export default function EstimatePage() {
  const { id = '' } = useParams();
  return <EstimateScreen id={id} />;
}
