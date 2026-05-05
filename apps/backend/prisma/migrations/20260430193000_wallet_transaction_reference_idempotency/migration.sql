-- Ensure payment ledger entries cannot be duplicated for the same wallet.
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_reference_key"
ON "wallet_transactions"("wallet_id", "reference");
