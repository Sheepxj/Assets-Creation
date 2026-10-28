package com.sheepxj.assets.template;

import com.sheepxj.assets.contract.ApiContracts.CategoryDto;
import com.sheepxj.assets.contract.ApiContracts.TemplateDto;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/templates")
public class TemplateController {
    private final TemplateService templates;
    public TemplateController(TemplateService templates) { this.templates = templates; }
    @GetMapping("/categories") public List<CategoryDto> categories() { return templates.categories(); }
    @GetMapping public List<TemplateDto> list(@RequestParam(required = false) String category) { return templates.list(category); }
    @GetMapping("/{id}") public TemplateDto detail(@PathVariable String id) { return templates.detail(id); }
}
