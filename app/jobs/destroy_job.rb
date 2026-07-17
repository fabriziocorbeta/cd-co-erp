class DestroyJob < ApplicationJob
  queue_as :low_priority
  self.enqueue_after_transaction_commit = :never

  def perform(model)
    model.destroy
  rescue => e
    Rails.logger.error("DestroyJob failed for #{model.class.name}##{model.id}: #{e.message}")
    model.update!(scheduled_for_deletion: false) # Let's the user try again by resetting the state
  end
end
