<?php

namespace App\Services\Monitoring\Contracts;

use Carbon\CarbonImmutable;

interface DataIntegrityDomainScanner
{
    public function domain(): string;

    /**
     * @return list<array{
     *     key:string,
     *     domain:string,
     *     severity:string,
     *     title:string,
     *     description:string,
     *     recommended_action:string,
     *     reconciliation:string,
     *     count:int,
     *     samples:list<array{record_id:int|string,related_record_id?:int|string}>,
     *     context:array<string, int|string|bool|null>
     * }>
     */
    public function scan(CarbonImmutable $at, int $sampleLimit): array;
}
