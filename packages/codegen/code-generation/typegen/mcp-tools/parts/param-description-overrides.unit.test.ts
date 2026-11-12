import { describe, it, expect } from 'vitest';

import { applyParamDescriptionOverrides } from './param-description-overrides.js';
import type { ParamMetadataMap } from './param-metadata.js';

function makeParam(description: string): ParamMetadataMap {
  return {
    testParam: {
      typePrimitive: 'number',
      valueConstraint: false,
      required: false,
      description,
    },
  };
}

describe('applyParamDescriptionOverrides', () => {
  it('corrects the offset description on the lessons endpoint', () => {
    // Incoming descriptions model what the upstream spec currently serves:
    // generic whole-list pagination wording that misses the per-unit semantics.
    const query: ParamMetadataMap = {
      offset: {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
        description:
          'If limiting results returned, this allows you to return the next set of results, starting at the given offset point',
      },
      limit: {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
        description: 'Limit the number of lessons, e.g. return a maximum of 300 lessons',
      },
    };

    applyParamDescriptionOverrides('/key-stages/{keyStage}/subject/{subject}/lessons', {}, query);

    expect(query.offset?.description).toBe(
      'Offset applied to lessons within each unit (not to the unit list).',
    );
    expect(query.limit?.description).toBe(
      'Limit the number of lessons returned per unit. Units with zero lessons after limiting are omitted.',
    );
  });

  it('does not modify parameters on unrelated paths', () => {
    const query = makeParam('original description');

    applyParamDescriptionOverrides('/subjects', {}, query);

    expect(query.testParam?.description).toBe('original description');
  });

  it('does not modify parameters that are not in the override map', () => {
    const query: ParamMetadataMap = {
      year: {
        typePrimitive: 'string',
        valueConstraint: false,
        required: false,
        description: 'Year filter',
      },
    };

    applyParamDescriptionOverrides('/key-stages/{keyStage}/subject/{subject}/lessons', {}, query);

    expect(query.year?.description).toBe('Year filter');
  });
});
