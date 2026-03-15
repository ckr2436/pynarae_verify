<?php

declare(strict_types=1);

namespace Pynarae\Verify\Console\Command;

use Magento\Framework\App\ResourceConnection;
use Magento\Framework\Console\Cli;
use Magento\Framework\Exception\LocalizedException;
use Pynarae\Verify\Model\CodeFormatter;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ImportCsvCommand extends Command
{
    private const ARG_FILE = 'file';

    public function __construct(
        private readonly ResourceConnection $resourceConnection,
        private readonly CodeFormatter $codeFormatter,
        ?string $name = null
    ) {
        parent::__construct($name);
    }

    protected function configure(): void
    {
        $this->setName('pynarae:verify:import-csv')
            ->setDescription('Import verification codes from CSV')
            ->addArgument(self::ARG_FILE, InputArgument::REQUIRED, 'Absolute path to CSV file');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $file = (string)$input->getArgument(self::ARG_FILE);

        if (!is_file($file) || !is_readable($file)) {
            $output->writeln('<error>CSV file not found or not readable.</error>');
            return Cli::RETURN_FAILURE;
        }

        $handle = fopen($file, 'rb');
        if ($handle === false) {
            $output->writeln('<error>Unable to open CSV file.</error>');
            return Cli::RETURN_FAILURE;
        }

        $connection = $this->resourceConnection->getConnection();
        $table = $this->resourceConnection->getTableName('pynarae_verify_code');

        $rowNumber = 0;
        $imported = 0;
        $skipped = 0;

        try {
            while (($row = fgetcsv($handle)) !== false) {
                $rowNumber++;

                if ($rowNumber === 1) {
                    $firstColumn = isset($row[0]) ? preg_replace('/^\xEF\xBB\xBF/', '', (string)$row[0]) : '';
                    if (strtolower(trim((string)$firstColumn)) === 'code') {
                        continue;
                    }
                }

                $code = $this->codeFormatter->normalize((string)($row[0] ?? ''));
                $productSku = trim((string)($row[1] ?? ''));
                $batchNo = trim((string)($row[2] ?? ''));
                $status = (int)($row[3] ?? 1);
                $notes = trim((string)($row[4] ?? ''));
                $metaJson = trim((string)($row[5] ?? ''));

                if ($code === '' || !$this->codeFormatter->isValidFormat($code)) {
                    $skipped++;
                    continue;
                }

                if ($metaJson !== '') {
                    json_decode($metaJson, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        throw new LocalizedException(
                            __('Invalid JSON in meta_json column on row %1.', $rowNumber)
                        );
                    }
                }

                $connection->insertOnDuplicate(
                    $table,
                    [
                        'code' => $code,
                        'product_sku' => $productSku !== '' ? $productSku : null,
                        'batch_no' => $batchNo !== '' ? $batchNo : null,
                        'status' => $status === 0 ? 0 : 1,
                        'notes' => $notes !== '' ? $notes : null,
                        'meta_json' => $metaJson !== '' ? $metaJson : null,
                    ],
                    ['product_sku', 'batch_no', 'status', 'notes', 'meta_json']
                );

                $imported++;
            }
        } catch (\Throwable $e) {
            fclose($handle);
            $output->writeln('<error>' . $e->getMessage() . '</error>');
            return Cli::RETURN_FAILURE;
        }

        fclose($handle);

        $output->writeln(sprintf('<info>Imported or updated %d code(s).</info>', $imported));
        $output->writeln(sprintf('<comment>Skipped %d invalid row(s).</comment>', $skipped));

        return Cli::RETURN_SUCCESS;
    }
}
