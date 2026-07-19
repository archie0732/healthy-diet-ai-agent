import { RelationType, PolicyState } from './types';

export class PolicyStore {
  public static getPolicyState(relationType: RelationType): PolicyState {
    switch (relationType) {
      case 'duplicate':
        return 'deprecated';
      case 'superseded':
        return 'deprecated';
      case 'conflicting':
        return 'deprecated';
      case 'conditional_difference':
        return 'retain';
      case 'complementary':
        return 'retain';
      default:
        return 'retain';
    }
  }
}
