# Rota-Wise Schedule Generator Tests

This directory contains comprehensive tests for the Rota-Wise scheduling algorithm. The tests verify that all requirements and restrictions are properly enforced by the scheduling system.

## Test Files

### `schedule-generator.test.ts`
Core functionality tests for the schedule generator algorithm.

### `schedule-validation.test.ts`
Advanced validation tests including constraint verification, edge cases, and performance tests.

## Test Coverage

### 1. Basic Functionality Tests
- **Date Range Validation**: Ensures schedules are generated for the correct date range
- **Complete Coverage**: Verifies all days in the range have schedule entries
- **Empty Doctor List**: Handles edge case of no doctors available

### 2. Minimum Interval Constraint Tests
- **Interval Enforcement**: Verifies minimum days between work assignments for each doctor
- **Pre-assigned Integration**: Ensures pre-assigned dates respect minimum intervals
- **Complex Scenarios**: Tests with varying interval lengths (1-30 days)

### 3. Vacation Dates Constraint Tests
- **No Work on Vacation**: Doctors cannot be assigned work on vacation days
- **Vacation Entry Creation**: Proper vacation entries are created for all vacation dates
- **Multiple Vacation Periods**: Handles doctors with multiple vacation periods

### 4. Excluded Dates Constraint Tests
- **No Work on Excluded Dates**: Doctors cannot be assigned work on excluded days
- **Flexible Exclusions**: Different doctors can have different excluded dates

### 5. Pre-assigned Work Dates Tests
- **Honor Pre-assignments**: All pre-assigned work dates are preserved
- **Conflict Detection**: Warns when multiple doctors are pre-assigned to same date
- **Integration with Other Constraints**: Pre-assignments work with intervals and vacations

### 6. Excluded from Automatic Assignment Tests
- **No Auto-assignment**: Excluded doctors don't get automatic work assignments
- **Pre-assignment Preservation**: Excluded doctors can still have pre-assigned dates
- **Partial Exclusion**: Only some doctors can be excluded while others are auto-assigned

### 7. Workload Distribution Tests
- **Fair Distribution**: Work is distributed fairly among available doctors
- **Uneven Availability**: Handles doctors with different availability due to vacations
- **Day-of-Week Balance**: Ensures fair distribution across different days of the week
- **Monthly Balance**: Distributes work fairly across months

### 8. Fixed Entries Integration Tests
- **Preservation**: Existing fixed entries are preserved during regeneration
- **Constraint Integration**: Fixed entries are considered in minimum interval calculations
- **Conflict Avoidance**: New assignments don't conflict with fixed entries

### 9. Complex Constraint Combination Tests
- **Multi-constraint Scenarios**: Multiple constraints work together correctly
- **Real-world Scenarios**: Tests complex, realistic scheduling scenarios
- **Edge Case Handling**: Extreme constraint combinations are handled gracefully

### 10. Weekend and Day-of-Week Distribution Tests
- **Weekend Fairness**: Weekend work is distributed fairly among doctors
- **Full Week Coverage**: Work assignments span all days of the week
- **Balanced Rotation**: No doctor is consistently assigned same days

### 11. Edge Case and Error Handling Tests
- **Single Day Schedules**: Handles schedules for just one day
- **Very Large Intervals**: Works with extreme minimum intervals
- **Impossible Constraints**: Generates warnings when no assignment is possible
- **Invalid Date Ranges**: Handles edge cases in date range specification

### 12. Performance and Stress Tests
- **Large Doctor Counts**: Handles 15+ doctors efficiently
- **Long-term Schedules**: Generates annual schedules (365+ days)
- **Heavy Constraints**: Performs well with many vacation/excluded dates
- **Time Constraints**: Completes generation within reasonable time limits

## Validation Functions

### `validateScheduleConstraints()`
A comprehensive validation function that checks all constraints:

1. **Minimum Interval Violations**: Checks work day spacing for each doctor
2. **Vacation Violations**: Ensures no work on vacation days
3. **Excluded Date Violations**: Ensures no work on excluded days
4. **Pre-assignment Fulfillment**: Verifies all pre-assignments are honored
5. **Auto-assignment Exclusion**: Checks excluded doctors aren't auto-assigned
6. **Fixed Entry Preservation**: Verifies fixed entries are maintained
7. **Date Range Coverage**: Ensures all dates have appropriate entries

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test schedule-generator.test.ts
npm test schedule-validation.test.ts
```

## Test Data Patterns

### Common Test Scenarios
- **Basic Setup**: 2-3 doctors, 1 month period, minimal constraints
- **Constraint Heavy**: Multiple vacations, exclusions, pre-assignments
- **Edge Cases**: Single doctor, single day, extreme intervals
- **Performance**: Many doctors, long periods, heavy constraint loads

### Date Patterns
- **Standard Month**: January 2024 (31 days)
- **Leap Year**: February 2024 (29 days)
- **Full Year**: 2024 (366 days)
- **Short Period**: 1-10 days for edge case testing

## Expected Behaviors

### Constraint Priority
1. **Fixed Entries**: Highest priority, never changed
2. **Vacation Dates**: Cannot be overridden for work
3. **Pre-assigned Work**: Must be honored if possible
4. **Excluded Dates**: Cannot be assigned work
5. **Minimum Intervals**: Enforced for all work assignments
6. **Auto-assignment Exclusion**: Respected for eligible doctors

### Warning Generation
- **Pre-assignment Conflicts**: Multiple doctors on same date
- **Uncovered Days**: No doctor available due to constraints
- **Constraint Violations**: When constraints make scheduling impossible

### Performance Expectations
- **Small Schedules** (≤5 doctors, ≤3 months): < 1 second
- **Medium Schedules** (≤10 doctors, ≤6 months): < 2 seconds
- **Large Schedules** (≤15 doctors, ≤12 months): < 5 seconds

## Error Conditions

### Handled Gracefully
- No doctors available
- Impossible constraint combinations
- Invalid date ranges
- Conflicting pre-assignments

### Should Generate Warnings
- Days with no coverage due to constraints
- Multiple doctors pre-assigned to same date
- Constraint violations in manual adjustments

## Maintenance

When modifying the scheduling algorithm:

1. **Run Full Test Suite**: Ensure all existing tests pass
2. **Add New Tests**: For any new constraints or features
3. **Update Validation**: Modify `validateScheduleConstraints()` as needed
4. **Performance Check**: Verify performance tests still pass
5. **Documentation**: Update this README for new test patterns

## Test Philosophy

These tests follow the principle of **comprehensive constraint verification**:
- Every scheduling rule has dedicated tests
- Edge cases are explicitly tested
- Performance is monitored and constrained
- Real-world scenarios are simulated
- Error conditions are handled gracefully

The goal is to ensure the scheduling algorithm is reliable, fair, and performs well under all realistic conditions. 