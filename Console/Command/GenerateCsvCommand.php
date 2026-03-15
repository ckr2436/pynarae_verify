<?php

declare(strict_types=1);

namespace Pynarae\Verify\Console\Command;

use Magento\Framework\App\ResourceConnection;
use Magento\Framework\Console\Cli;
use Magento\Framework\UrlInterface;
use Magento\Store\Model\StoreManagerInterface;
use Pynarae\Verify\Model\CodeGenerator;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class GenerateCsvCommand extends Command
{
    public function __construct(
        private readonly ResourceConnection $resourceConnection,
        private readonly CodeGenerator $codeGenerator,
        private readonly StoreManagerInterface $storeManager,
        ?string $name = null
    ) {
        parent::__construct($name);
    }

    protected function configure(): void
    {
        $this->setName('pynarae:verify:generate-csv')
            ->setDescription('Generate new verification codes to CSV')
            ->addOption('count', null, InputOption::VALUE_REQUIRED, 'Number of codes to generate', '100')
            ->addOption('length', null, InputOption::VALUE_REQUIRED, 'Random body length', '12')
            ->addOption('prefix', null, InputOption::VALUE_OPTIONAL, 'Code prefix', 'PYN-')
            ->addOption('sku', null, InputOption::VALUE_OPTIONAL, 'Product SKU', '')
            ->addOption('batch', null, InputOption::VALUE_OPTIONAL, 'Batch number', '')
            ->addOption('status', null, InputOption::VALUE_OPTIONAL, 'Status (1 enabled, 0 disabled)', '1')
            ->addOption('notes', null, InputOption::VALUE_OPTIONAL, 'Notes', '')
            ->addOption('meta-json', null, InputOption::VALUE_OPTIONAL, 'Meta JSON payload', '')
            ->addOption('output', null, InputOption::VALUE_REQUIRED, 'Absolute or relative CSV output path')
            ->addOption('insert', null, InputOption::VALUE_OPTIONAL, 'Insert generated codes into DB (1 or 0)', '0');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $count = max(1, (int)$input->getOption('count'));
        $length = max(6, (int)$input->getOption('length'));
        $prefix = (string)$input->getOption('prefix');
        $sku = trim((string)$input->getOption('sku'));
        $batch = trim((string)$input->getOption('batch'));
        $status = ((int)$input->getOption('status')) === 0 ? 0 : 1;
        $notes = trim((string)$input->getOption('notes'));
        $metaJson = trim((string)$input->getOption('meta-json'));
        $outputPath = trim((string)$input->getOption('output'));
        $insert = ((int)$input->getOption('insert')) === 1;

        if ($outputPath === '') {
            $output->writeln('<error>The --output option is required.</error>');
            return Cli::RETURN_FAILURE;
        }

        if ($metaJson !== '') {
            json_decode($metaJson, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $output->writeln('<error>Invalid JSON passed to --meta-json.</error>');
                return Cli::RETURN_FAILURE;
            }
        }

        $connection = $this->resourceConnection->getConnection();
        $table = $this->resourceConnection->getTableName('pynarae_verify_code');

        $existsCallback = function (string $code) use ($connection, $table): bool {
            $select = $connection->select()
                ->from($table, ['entity_id'])
                ->where('code = ?', $code)
                ->limit(1);

            return (bool)$connection->fetchOne($select);
        };

        $codes = $this->codeGenerator->generateBatch($count, $length, $prefix, $existsCallback);

        $storeBaseUrl = rtrim($this->storeManager->getStore()->getBaseUrl(UrlInterface::URL_TYPE_WEB), '/');
        $verifyBaseUrl = $storeBaseUrl . '/verify';

        $directory = dirname($outputPath);
        if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
            $output->writeln('<error>Could not create output directory.</error>');
            return Cli::RETURN_FAILURE;
        }

        $handle = fopen($outputPath, 'wb');
        if ($handle === false) {
            $output->writeln('<error>Could not open output file for writing.</error>');
            return Cli::RETURN_FAILURE;
        }

        fputcsv($handle, ['code', 'product_sku', 'batch_no', 'status', 'notes', 'meta_json', 'verify_url']);

        foreach ($codes as $code) {
            fputcsv($handle, [
                $code,
                $sku,
                $batch,
                $status,
                $notes,
                $metaJson,
                $verifyBaseUrl . '?code=' . rawurlencode($code),
            ]);
        }

        fclose($handle);

        if ($insert) {
            foreach ($codes as $code) {
                $connection->insertOnDuplicate(
                    $table,
                    [
                        'code' => $code,
                        'product_sku' => $sku !== '' ? $sku : null,
                        'batch_no' => $batch !== '' ? $batch : null,
                        'status' => $status,
                        'notes' => $notes !== '' ? $notes : null,
                        'meta_json' => $metaJson !== '' ? $metaJson : null,
                    ],
                    ['product_sku', 'batch_no', 'status', 'notes', 'meta_json']
                );
            }
        }

        $output->writeln(sprintf('<info>Generated %d code(s).</info>', count($codes)));
        $output->writeln(sprintf('<info>CSV written to %s</info>', $outputPath));
        if ($insert) {
            $output->writeln('<comment>Generated codes were also inserted into the database.</comment>');
        }

        return Cli::RETURN_SUCCESS;
    }
}
