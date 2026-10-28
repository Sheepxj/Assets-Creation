package com.sheepxj.assets.template;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.CategoryDto;
import com.sheepxj.assets.contract.ApiContracts.TemplateDto;
import com.sheepxj.assets.persistence.mapper.TemplateMapper;
import com.sheepxj.assets.persistence.model.TemplateRecord;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class TemplateService {
    private final TemplateMapper templates;
    public TemplateService(TemplateMapper templates) { this.templates = templates; }

    public List<CategoryDto> categories() { return templates.findCategories(); }
    public List<TemplateDto> list(String category) {
        String filter = category == null || category.isBlank() ? null : category.strip();
        return templates.findAll(filter).stream().map(this::toDto).toList();
    }
    public TemplateDto detail(String id) {
        var template = templates.findById(id);
        if (template == null) throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "模板不存在或已不可用");
        return toDto(template);
    }
    private TemplateDto toDto(TemplateRecord template) {
        return new TemplateDto(template.id(), template.title(), template.category(), "/api/demo/" + template.coverPath(),
                template.description(), template.requiredImageCount(), template.acceptedMimeTypes(), template.maxFileSizeBytes());
    }
}
