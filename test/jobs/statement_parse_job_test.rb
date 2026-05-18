require "test_helper"

class StatementParseJobTest < ActiveJob::TestCase
  test "job is queued on perform_later" do
    assert_enqueued_with(job: StatementParseJob) do
      StatementParseJob.perform_later(999)
    end
  end

  test "inherits from ApplicationJob" do
    assert StatementParseJob.ancestors.include?(ApplicationJob)
  end

  test "queued on default queue" do
    assert_equal "default", StatementParseJob.new.queue_name
  end
end
