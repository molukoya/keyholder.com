import { describe, expect, it } from 'vitest';
import { splitStreet } from './avm';

describe('street addresses for Repliers', () => {
  it('splits the number, name, street type and unit the way MLS boards write them', () => {
    expect(splitStreet('160 Wellington Street')).toEqual({ unitNumber: undefined, streetNumber: '160', streetName: 'Wellington', streetSuffix: 'St' });
    expect(splitStreet('12-100 Queen St W')).toEqual({ unitNumber: '12', streetNumber: '100', streetName: 'Queen', streetSuffix: 'St' });
    expect(splitStreet('9 Oak Crescent')).toMatchObject({ streetNumber: '9', streetName: 'Oak', streetSuffix: 'Cres' });
    expect(splitStreet('1 Avenue Road')).toMatchObject({ streetName: 'Avenue', streetSuffix: 'Rd' });
    expect(splitStreet('22B Lakeshore')).toMatchObject({ streetNumber: '22B', streetName: 'Lakeshore', streetSuffix: undefined });
    expect(splitStreet('Rural Route 2')).toMatchObject({ streetNumber: '', streetName: 'Rural Route 2' });
  });
});
