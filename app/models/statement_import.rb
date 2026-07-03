class StatementImport < ApplicationRecord
  belongs_to :family
  belongs_to :user

  has_one_attached :source_file

  enum :status, { pending: 0, processing: 1, review: 2, completed: 3, failed: 4 }

  validates :family, presence: true
  validates :user, presence: true

  scope :recent, -> { order(created_at: :desc) }

  def transactions_for_review
    (raw_transactions || []).map { |t| StatementParser::ParsedTransaction.new(t) }
  end
end
